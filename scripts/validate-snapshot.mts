import { computeStats } from './normalize-issues.mts';
import { normalizeClosureReason } from './normalize-issues.mts';
import { SNAPSHOT_SCHEMA_VERSION } from './types.mts';
import type { Snapshot, SnapshotIssue } from './types.mts';

export class SnapshotValidationError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`Invalid snapshot:\n- ${problems.join('\n- ')}`);
    this.name = 'SnapshotValidationError';
    this.problems = problems;
  }
}

type Obj = Record<string, unknown>;

const CLOSURE_REASONS = new Set(['COMPLETED', 'NOT_PLANNED', 'UNKNOWN']);

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

function isHttpUrl(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  try {
    const url = new URL(v);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Returns true when the issue is structurally valid. Problems are appended to `problems`. */
function checkIssue(issue: unknown, at: string, problems: string[]): boolean {
  const before = problems.length;
  if (!isObj(issue)) {
    problems.push(`${at} is not an object`);
    return false;
  }

  if (!isStr(issue['id'])) problems.push(`${at}.id must be a non-empty string`);
  const number = issue['number'];
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 1) {
    problems.push(`${at}.number must be a positive integer`);
  }
  if (!isStr(issue['title'])) problems.push(`${at}.title must be a non-empty string`);
  if (!isHttpUrl(issue['url'])) problems.push(`${at}.url must be an http(s) URL`);
  if (!isDate(issue['closedAt'])) problems.push(`${at}.closedAt must be a valid date`);

  const author = issue['author'];
  if (author !== null) {
    if (!isObj(author) || !isStr(author['login'])) {
      problems.push(`${at}.author must be null or have a login`);
    } else if (author['avatarUrl'] !== null && !isHttpUrl(author['avatarUrl'])) {
      problems.push(`${at}.author.avatarUrl must be null or an http(s) URL`);
    }
  }

  const labels = issue['labels'];
  if (!Array.isArray(labels)) {
    problems.push(`${at}.labels must be an array`);
  } else {
    labels.forEach((label: unknown, i: number) => {
      if (!isObj(label) || !isStr(label['name']) || typeof label['color'] !== 'string') {
        problems.push(`${at}.labels[${i}] must have a name and a color`);
      }
    });
  }

  const reason = issue['closureReason'];
  const raw = issue['rawClosureReason'];
  if (typeof reason !== 'string' || !CLOSURE_REASONS.has(reason)) {
    problems.push(`${at}.closureReason must be COMPLETED, NOT_PLANNED or UNKNOWN`);
  } else if (raw !== null && typeof raw !== 'string') {
    problems.push(`${at}.rawClosureReason must be a string or null`);
  } else if (normalizeClosureReason(raw as string | null) !== reason) {
    problems.push(`${at}.closureReason (${reason}) does not match rawClosureReason (${String(raw)})`);
  }

  return problems.length === before;
}

/**
 * Validates an unknown value against the snapshot contract.
 * Throws SnapshotValidationError listing every problem found.
 */
export function validateSnapshot(value: unknown): Snapshot {
  if (!isObj(value)) throw new SnapshotValidationError(['snapshot is not an object']);

  const problems: string[] = [];

  if (value['schemaVersion'] !== SNAPSHOT_SCHEMA_VERSION) {
    problems.push(`schemaVersion must be ${SNAPSHOT_SCHEMA_VERSION}`);
  }
  if (!isDate(value['generatedAt'])) problems.push('generatedAt must be a valid date');
  if (!isStr(value['angularVersion'])) problems.push('angularVersion must be a non-empty string');

  const repository = value['repository'];
  if (!isObj(repository)) {
    problems.push('repository must be an object');
  } else {
    if (!isStr(repository['owner'])) problems.push('repository.owner must be a non-empty string');
    if (!isStr(repository['name'])) problems.push('repository.name must be a non-empty string');
    if (!isHttpUrl(repository['url'])) problems.push('repository.url must be an http(s) URL');
  }

  const rawIssues = value['issues'];
  const issues: SnapshotIssue[] = [];
  let allIssuesValid = false;

  if (!Array.isArray(rawIssues)) {
    problems.push('issues must be an array');
  } else {
    allIssuesValid = true;
    rawIssues.forEach((issue: unknown, i: number) => {
      if (checkIssue(issue, `issues[${i}]`, problems)) issues.push(issue as SnapshotIssue);
      else allIssuesValid = false;
    });
  }

  if (allIssuesValid) {
    const ids = new Map<string, number>();
    const numbers = new Map<number, number>();
    issues.forEach((issue, i) => {
      const firstId = ids.get(issue.id);
      if (firstId !== undefined) problems.push(`issues[${i}].id duplicates issues[${firstId}].id`);
      else ids.set(issue.id, i);

      const firstNumber = numbers.get(issue.number);
      if (firstNumber !== undefined) {
        problems.push(`issues[${i}].number duplicates issues[${firstNumber}].number`);
      } else numbers.set(issue.number, i);

      const previous = issues[i - 1];
      if (previous) {
        const diff = Date.parse(previous.closedAt) - Date.parse(issue.closedAt);
        if (diff < 0 || (diff === 0 && previous.number < issue.number)) {
          problems.push(`issues are not sorted newest first (issues[${i}] should come before issues[${i - 1}])`);
        }
      }
    });
  }

  const stats = value['stats'];
  if (!isObj(stats)) {
    problems.push('stats must be an object');
  } else {
    for (const key of ['total', 'completed', 'notPlanned', 'unknown']) {
      if (!isCount(stats[key])) problems.push(`stats.${key} must be a non-negative integer`);
    }
    if (allIssuesValid) {
      const expected = computeStats(issues);
      for (const key of ['total', 'completed', 'notPlanned', 'unknown'] as const) {
        if (isCount(stats[key]) && stats[key] !== expected[key]) {
          problems.push(`stats.${key} is ${stats[key]} but the issue list gives ${expected[key]}`);
        }
      }
    }
  }

  if (problems.length > 0) throw new SnapshotValidationError(problems);
  return value as unknown as Snapshot;
}