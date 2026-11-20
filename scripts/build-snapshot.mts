import { computeStats, normalizeIssues } from './normalize-issues.mts';
import type { RawIssueNode } from './normalize-issues.mts';
import { SNAPSHOT_SCHEMA_VERSION } from './types.mts';
import type { Snapshot } from './types.mts';
import { validateSnapshot } from './validate-snapshot.mts';

export interface BuildSnapshotInput {
  owner: string;
  name: string;
  repositoryUrl: string;
  angularVersion: string;
  nodes: readonly RawIssueNode[];
  generatedAt?: Date;
}

export interface BuildSnapshotResult {
  snapshot: Snapshot;
  duplicatesRemoved: number;
}

/** Normalizes, computes stats over the full list, and validates before returning. */
export function buildSnapshot(input: BuildSnapshotInput): BuildSnapshotResult {
  const { issues, duplicatesRemoved } = normalizeIssues(input.nodes);

  const snapshot = validateSnapshot({
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    repository: { owner: input.owner, name: input.name, url: input.repositoryUrl },
    angularVersion: input.angularVersion,
    stats: computeStats(issues),
    issues,
  });

  return { snapshot, duplicatesRemoved };
}

/** Splits the GITHUB_REPOSITORY value ("owner/name") that GitHub Actions provides. */
export function parseRepository(value: string | undefined): { owner: string; name: string } {
  const parts = (value ?? '').split('/');
  const [owner, name] = parts;
  if (parts.length !== 2 || !owner || !name) {
    throw new Error(`GITHUB_REPOSITORY must look like "owner/name", got: "${value ?? ''}"`);
  }
  return { owner, name };
}

/** Last line of defense: refuse to write a file that contains the token. */
export function assertTokenNotPresent(serialized: string, token: string): void {
  if (token.length > 0 && serialized.includes(token)) {
    throw new Error('Refusing to write the snapshot: it contains the GitHub token');
  }
}