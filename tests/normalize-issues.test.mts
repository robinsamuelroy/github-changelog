import { describe, expect, it } from 'vitest';
import {
  computeStats,
  normalizeClosureReason,
  normalizeIssue,
  normalizeIssues,
  type RawIssueNode,
} from '../scripts/normalize-issues.mts';

function makeNode(overrides: Partial<RawIssueNode> = {}): RawIssueNode {
  return {
    id: 'I_1',
    number: 1,
    title: 'Example issue',
    url: 'https://example.test/o/r/issues/1',
    closedAt: '2026-03-15T10:00:00Z',
    stateReason: 'COMPLETED',
    author: { login: 'octocat', avatarUrl: 'https://example.test/a.png' },
    labels: { nodes: [{ name: 'bug', color: 'd73a4a' }] },
    ...overrides,
  };
}

describe('normalizeClosureReason', () => {
  it('maps COMPLETED', () => {
    expect(normalizeClosureReason('COMPLETED')).toBe('COMPLETED');
  });
  it('maps NOT_PLANNED', () => {
    expect(normalizeClosureReason('NOT_PLANNED')).toBe('NOT_PLANNED');
  });
  it('maps null to UNKNOWN, never COMPLETED', () => {
    expect(normalizeClosureReason(null)).toBe('UNKNOWN');
    expect(normalizeClosureReason(undefined)).toBe('UNKNOWN');
  });
  it('maps unrecognized values to UNKNOWN', () => {
    expect(normalizeClosureReason('DUPLICATE')).toBe('UNKNOWN');
    expect(normalizeClosureReason('completed')).toBe('UNKNOWN');
    expect(normalizeClosureReason('SOMETHING_NEW')).toBe('UNKNOWN');
  });
});

describe('normalizeIssue', () => {
  it('normalizes a complete issue', () => {
    const issue = normalizeIssue(makeNode());
    expect(issue).toEqual({
      id: 'I_1',
      number: 1,
      title: 'Example issue',
      url: 'https://example.test/o/r/issues/1',
      author: { login: 'octocat', avatarUrl: 'https://example.test/a.png' },
      labels: [{ name: 'bug', color: 'd73a4a' }],
      closedAt: '2026-03-15T10:00:00.000Z',
      closureReason: 'COMPLETED',
      rawClosureReason: 'COMPLETED',
    });
  });

  it('keeps the raw value for an unknown reason', () => {
    const issue = normalizeIssue(makeNode({ stateReason: 'DUPLICATE' }));
    expect(issue.closureReason).toBe('UNKNOWN');
    expect(issue.rawClosureReason).toBe('DUPLICATE');
  });

  it('keeps an issue with a null author', () => {
    expect(normalizeIssue(makeNode({ author: null })).author).toBeNull();
  });

  it('handles missing labels', () => {
    expect(normalizeIssue(makeNode({ labels: null })).labels).toEqual([]);
    expect(normalizeIssue(makeNode({ labels: { nodes: null } })).labels).toEqual([]);
  });

  it('skips null entries inside the label list', () => {
    const issue = normalizeIssue(
      makeNode({ labels: { nodes: [null, { name: 'docs', color: '0075ca' }] } }),
    );
    expect(issue.labels).toEqual([{ name: 'docs', color: '0075ca' }]);
  });

  it('throws when closedAt is missing', () => {
    expect(() => normalizeIssue(makeNode({ closedAt: null }))).toThrow(/no closedAt/);
  });

  it('throws when closedAt is not a valid date', () => {
    expect(() => normalizeIssue(makeNode({ closedAt: 'not-a-date' }))).toThrow(/invalid closedAt/);
  });
});

describe('normalizeIssues', () => {
  it('returns an empty result for no issues', () => {
    expect(normalizeIssues([])).toEqual({ issues: [], duplicatesRemoved: 0 });
  });

  it('handles a single issue', () => {
    expect(normalizeIssues([makeNode()]).issues).toHaveLength(1);
  });

  it('sorts newest closure first', () => {
    const { issues } = normalizeIssues([
      makeNode({ id: 'a', number: 1, closedAt: '2026-01-10T00:00:00Z' }),
      makeNode({ id: 'b', number: 2, closedAt: '2026-03-10T00:00:00Z' }),
      makeNode({ id: 'c', number: 3, closedAt: '2026-02-10T00:00:00Z' }),
    ]);
    expect(issues.map((i) => i.number)).toEqual([2, 3, 1]);
  });

  it('breaks ties by issue number, newest first', () => {
    const { issues } = normalizeIssues([
      makeNode({ id: 'a', number: 5, closedAt: '2026-03-10T00:00:00Z' }),
      makeNode({ id: 'b', number: 9, closedAt: '2026-03-10T00:00:00Z' }),
    ]);
    expect(issues.map((i) => i.number)).toEqual([9, 5]);
  });

  it('sorts by the real instant even when offsets differ', () => {
    const { issues } = normalizeIssues([
      makeNode({ id: 'a', number: 1, closedAt: '2026-03-10T01:00:00+02:00' }),
      makeNode({ id: 'b', number: 2, closedAt: '2026-03-09T23:30:00Z' }),
    ]);
    // 01:00+02:00 is 23:00Z on the 9th, so #2 (23:30Z) is newer.
    expect(issues.map((i) => i.number)).toEqual([2, 1]);
  });

  it('removes duplicate ids and counts them', () => {
    const result = normalizeIssues([
      makeNode({ id: 'a', number: 1 }),
      makeNode({ id: 'a', number: 1 }),
      makeNode({ id: 'b', number: 2 }),
    ]);
    expect(result.issues).toHaveLength(2);
    expect(result.duplicatesRemoved).toBe(1);
  });

  it.each([100, 101, 250, 251])('keeps all %i issues', (count) => {
    const nodes = Array.from({ length: count }, (_, i) =>
      makeNode({ id: `id-${i}`, number: i + 1, closedAt: new Date(2026, 0, 1, 0, i).toISOString() }),
    );
    expect(normalizeIssues(nodes).issues).toHaveLength(count);
  });
});

describe('computeStats', () => {
  it('returns zeros for an empty list', () => {
    expect(computeStats([])).toEqual({ total: 0, completed: 0, notPlanned: 0, unknown: 0 });
  });

  it('counts each closure reason and the total', () => {
    const { issues } = normalizeIssues([
      makeNode({ id: 'a', number: 1, stateReason: 'COMPLETED' }),
      makeNode({ id: 'b', number: 2, stateReason: 'COMPLETED' }),
      makeNode({ id: 'c', number: 3, stateReason: 'NOT_PLANNED' }),
      makeNode({ id: 'd', number: 4, stateReason: null }),
      makeNode({ id: 'e', number: 5, stateReason: 'DUPLICATE' }),
    ]);
    expect(computeStats(issues)).toEqual({ total: 5, completed: 2, notPlanned: 1, unknown: 2 });
  });
});