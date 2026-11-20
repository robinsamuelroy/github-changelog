import type {
  ClosureReason,
  SnapshotIssue,
  SnapshotLabel,
  SnapshotStats,
} from './types.mts';

/** The shape of one issue node as requested by the GraphQL query. */
export interface RawIssueNode {
  id: string;
  number: number;
  title: string;
  url: string;
  closedAt: string | null;
  stateReason: string | null;
  author: { login: string; avatarUrl: string | null } | null;
  labels: { nodes: Array<{ name: string; color: string } | null> | null } | null;
}

/**
 * Maps GitHub's stateReason to our closure reason.
 * Only exact known values are accepted. Null, missing, or new values become UNKNOWN,
 * never COMPLETED.
 */
export function normalizeClosureReason(raw: string | null | undefined): ClosureReason {
  if (raw === 'COMPLETED') return 'COMPLETED';
  if (raw === 'NOT_PLANNED') return 'NOT_PLANNED';
  return 'UNKNOWN';
}

export function normalizeIssue(node: RawIssueNode): SnapshotIssue {
  if (node.closedAt === null || node.closedAt === undefined) {
    throw new Error(`Issue #${node.number} is CLOSED but has no closedAt timestamp`);
  }
  const closed = new Date(node.closedAt);
  if (Number.isNaN(closed.getTime())) {
    throw new Error(`Issue #${node.number} has an invalid closedAt: ${node.closedAt}`);
  }

  const labels: SnapshotLabel[] = [];
  for (const label of node.labels?.nodes ?? []) {
    if (label) labels.push({ name: label.name, color: label.color });
  }

  return {
    id: node.id,
    number: node.number,
    title: node.title,
    url: node.url,
    author: node.author
      ? { login: node.author.login, avatarUrl: node.author.avatarUrl ?? null }
      : null,
    labels,
    closedAt: closed.toISOString(),
    closureReason: normalizeClosureReason(node.stateReason),
    rawClosureReason: node.stateReason ?? null,
  };
}

export function computeStats(issues: readonly SnapshotIssue[]): SnapshotStats {
  const stats: SnapshotStats = { total: issues.length, completed: 0, notPlanned: 0, unknown: 0 };
  for (const issue of issues) {
    if (issue.closureReason === 'COMPLETED') stats.completed += 1;
    else if (issue.closureReason === 'NOT_PLANNED') stats.notPlanned += 1;
    else stats.unknown += 1;
  }
  return stats;
}

export interface NormalizeResult {
  issues: SnapshotIssue[];
  duplicatesRemoved: number;
}

/**
 * Normalizes every node, drops duplicate ids (possible if issues change while we paginate),
 * and sorts newest closure first. Ties are broken by issue number, newest first.
 */
export function normalizeIssues(nodes: readonly RawIssueNode[]): NormalizeResult {
  const byId = new Map<string, SnapshotIssue>();
  let duplicatesRemoved = 0;

  for (const node of nodes) {
    if (byId.has(node.id)) {
      duplicatesRemoved += 1;
      continue;
    }
    byId.set(node.id, normalizeIssue(node));
  }

  const issues = [...byId.values()].sort((a, b) => {
    const diff = Date.parse(b.closedAt) - Date.parse(a.closedAt);
    return diff !== 0 ? diff : b.number - a.number;
  });

  return { issues, duplicatesRemoved };
}