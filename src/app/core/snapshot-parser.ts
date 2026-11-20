import { SNAPSHOT_SCHEMA_VERSION, type Snapshot } from './snapshot.model';

export class InvalidSnapshotError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`Invalid changelog snapshot: ${problems.join('; ')}`);
    this.name = 'InvalidSnapshotError';
    this.problems = problems;
  }
}

type Obj = Record<string, unknown>;

const REASONS = new Set(['COMPLETED', 'NOT_PLANNED', 'UNKNOWN']);

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

function isHttpUrl(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  try {
    const protocol = new URL(v).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

function checkIssue(issue: unknown, at: string, problems: string[]): void {
  if (!isObj(issue)) {
    problems.push(`${at} is not an object`);
    return;
  }
  if (!isStr(issue['id'])) problems.push(`${at}.id is missing`);
  const n = issue['number'];
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) problems.push(`${at}.number is invalid`);
  if (!isStr(issue['title'])) problems.push(`${at}.title is missing`);
  if (!isHttpUrl(issue['url'])) problems.push(`${at}.url is not an http(s) URL`);
  if (!isDate(issue['closedAt'])) problems.push(`${at}.closedAt is not a valid date`);

  const reason = issue['closureReason'];
  if (typeof reason !== 'string' || !REASONS.has(reason)) problems.push(`${at}.closureReason is invalid`);

  const author = issue['author'];
  if (author !== null && (!isObj(author) || !isStr(author['login']))) {
    problems.push(`${at}.author must be null or have a login`);
  }

  const labels = issue['labels'];
  if (!Array.isArray(labels)) {
    problems.push(`${at}.labels must be an array`);
  } else {
    labels.forEach((label: unknown, i: number) => {
      if (!isObj(label) || !isStr(label['name']) || typeof label['color'] !== 'string') {
        problems.push(`${at}.labels[${i}] is invalid`);
      }
    });
  }
}

/** Checks untrusted JSON against the snapshot contract and returns it typed. */
export function parseSnapshot(value: unknown): Snapshot {
  if (!isObj(value)) throw new InvalidSnapshotError(['the file is not a JSON object']);

  const problems: string[] = [];

  if (value['schemaVersion'] !== SNAPSHOT_SCHEMA_VERSION) {
    problems.push(`unsupported schemaVersion (expected ${SNAPSHOT_SCHEMA_VERSION})`);
  }
  if (!isDate(value['generatedAt'])) problems.push('generatedAt is not a valid date');
  if (!isStr(value['angularVersion'])) problems.push('angularVersion is missing');

  const repository = value['repository'];
  if (!isObj(repository)) {
    problems.push('repository is missing');
  } else {
    if (!isStr(repository['owner'])) problems.push('repository.owner is missing');
    if (!isStr(repository['name'])) problems.push('repository.name is missing');
    if (!isHttpUrl(repository['url'])) problems.push('repository.url is not an http(s) URL');
  }

  const stats = value['stats'];
  if (!isObj(stats)) {
    problems.push('stats is missing');
  } else {
    for (const key of ['total', 'completed', 'notPlanned', 'unknown']) {
      if (!isCount(stats[key])) problems.push(`stats.${key} is invalid`);
    }
  }

  const issues = value['issues'];
  if (!Array.isArray(issues)) {
    problems.push('issues must be an array');
  } else {
    issues.forEach((issue: unknown, i: number) => checkIssue(issue, `issues[${i}]`, problems));
  }

  if (problems.length > 0) throw new InvalidSnapshotError(problems);
  return value as unknown as Snapshot;
}