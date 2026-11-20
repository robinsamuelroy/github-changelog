/** Bump when the snapshot shape changes in a breaking way. */
export const SNAPSHOT_SCHEMA_VERSION = 1;

/**
 * Normalized closure reason.
 * UNKNOWN is explicit: a null or unrecognized GitHub value is never treated as COMPLETED.
 */
export type ClosureReason = 'COMPLETED' | 'NOT_PLANNED' | 'UNKNOWN';

export interface SnapshotLabel {
  name: string;
  /** Hex color without the leading '#', as returned by GitHub. */
  color: string;
}

export interface SnapshotAuthor {
  login: string;
  avatarUrl: string | null;
}

export interface SnapshotIssue {
  /** GitHub GraphQL node id. Used to detect duplicates. */
  id: string;
  number: number;
  title: string;
  url: string;
  /** Null when the account was deleted. GitHub reports it as "ghost" in the UI. */
  author: SnapshotAuthor | null;
  labels: SnapshotLabel[];
  /** ISO 8601 timestamp in UTC. */
  closedAt: string;
  closureReason: ClosureReason;
  /** The raw GitHub value, kept so UNKNOWN cases stay inspectable. */
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
  /** ISO 8601 timestamp in UTC. */
  generatedAt: string;
  repository: SnapshotRepository;
  /** Read from the installed @angular/core package at generation time. */
  angularVersion: string;
  /** Computed from the complete issue list, never from a filtered view. */
  stats: SnapshotStats;
  /** Sorted by closedAt descending. */
  issues: SnapshotIssue[];
}