/** Keep in sync with scripts/types.mts. */
export const SNAPSHOT_SCHEMA_VERSION = 1;

export type ClosureReason = 'COMPLETED' | 'NOT_PLANNED' | 'UNKNOWN';

export interface SnapshotLabel {
  name: string;
  /** Hex color without the leading '#'. */
  color: string;
}

export interface SnapshotAuthor {
  login: string;
  avatarUrl: string | null;
}

export interface SnapshotIssue {
  id: string;
  number: number;
  title: string;
  url: string;
  author: SnapshotAuthor | null;
  labels: SnapshotLabel[];
  /** ISO 8601, UTC. */
  closedAt: string;
  closureReason: ClosureReason;
  rawClosureReason: string | null;
}

export interface SnapshotStats {
  total: number;
  completed: number;
  notPlanned: number;
  unknown: number;
}

export interface SnapshotRepository {
  owner: string;
  name: string;
  url: string;
}

export interface Snapshot {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  generatedAt: string;
  repository: SnapshotRepository;
  angularVersion: string;
  stats: SnapshotStats;
  issues: SnapshotIssue[];
}