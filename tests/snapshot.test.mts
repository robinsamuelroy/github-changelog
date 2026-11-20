import { describe, expect, it } from 'vitest';
import { assertTokenNotPresent, buildSnapshot, parseRepository } from '../scripts/build-snapshot.mts';
import type { RawIssueNode } from '../scripts/normalize-issues.mts';
import { SnapshotValidationError, validateSnapshot } from '../scripts/validate-snapshot.mts';

function node(id: string, number: number, closedAt: string, stateReason: string | null): RawIssueNode {
  return {
    id,
    number,
    title: `Issue ${number}`,
    url: `https://github.com/acme/widgets/issues/${number}`,
    closedAt,
    stateReason,
    author: { login: 'octocat', avatarUrl: null },
    labels: { nodes: [{ name: 'bug', color: 'd73a4a' }] },
  };
}

const NODES: RawIssueNode[] = [
  node('a', 1, '2026-01-10T00:00:00Z', 'COMPLETED'),
  node('b', 2, '2026-02-10T00:00:00Z', 'NOT_PLANNED'),
  node('c', 3, '2026-03-10T00:00:00Z', null),
];

function build(nodes: readonly RawIssueNode[] = NODES) {
  return buildSnapshot({
    owner: 'acme',
    name: 'widgets',
    repositoryUrl: 'https://github.com/acme/widgets',
    angularVersion: '22.3.0',
    nodes,
    generatedAt: new Date('2026-11-20T12:00:00Z'),
  });
}

/** Deep copy of a valid snapshot, loosely typed so tests can break it. */
function broken(mutate: (s: any) => void): unknown {
  const copy: any = structuredClone(build().snapshot);
  mutate(copy);
  return copy;
}

describe('buildSnapshot', () => {
  it('builds sorted issues and stats from the full list', () => {
    const { snapshot } = build();
    expect(snapshot.issues.map((i) => i.number)).toEqual([3, 2, 1]);
    expect(snapshot.stats).toEqual({ total: 3, completed: 1, notPlanned: 1, unknown: 1 });
    expect(snapshot.repository).toEqual({
      owner: 'acme',
      name: 'widgets',
      url: 'https://github.com/acme/widgets',
    });
    expect(snapshot.angularVersion).toBe('22.3.0');
    expect(snapshot.generatedAt).toBe('2026-11-20T12:00:00.000Z');
    expect(snapshot.schemaVersion).toBe(1);
  });

  it('builds a valid snapshot for zero issues', () => {
    const { snapshot } = build([]);
    expect(snapshot.issues).toEqual([]);
    expect(snapshot.stats).toEqual({ total: 0, completed: 0, notPlanned: 0, unknown: 0 });
  });

  it('counts all 251 issues', () => {
    const nodes = Array.from({ length: 251 }, (_, i) =>
      node(`id-${i}`, i + 1, new Date(2026, 0, 1, 0, i).toISOString(), 'COMPLETED'),
    );
    expect(build(nodes).snapshot.stats.total).toBe(251);
  });

  it('reports removed duplicates', () => {
    const first = NODES[0];
    if (!first) throw new Error('fixture missing');
    expect(build([...NODES, first]).duplicatesRemoved).toBe(1);
  });

  it('throws for a closed issue without closedAt instead of dropping it', () => {
    const bad: RawIssueNode = { ...node('x', 9, '2026-01-01T00:00:00Z', null), closedAt: null };
    expect(() => build([...NODES, bad])).toThrow(/no closedAt/);
  });
});

describe('validateSnapshot', () => {
  it('accepts a valid snapshot', () => {
    expect(() => validateSnapshot(build().snapshot)).not.toThrow();
  });

  it('rejects a non-object', () => {
    expect(() => validateSnapshot(null)).toThrow(SnapshotValidationError);
    expect(() => validateSnapshot('text')).toThrow(/not an object/);
  });

  it('rejects the wrong schemaVersion', () => {
    expect(() => validateSnapshot(broken((s) => (s.schemaVersion = 2)))).toThrow(/schemaVersion/);
  });

  it('rejects a missing repository owner', () => {
    expect(() => validateSnapshot(broken((s) => delete s.repository.owner))).toThrow(/repository\.owner/);
  });

  it('rejects a total that does not match the issue list', () => {
    expect(() => validateSnapshot(broken((s) => (s.stats.total = 99)))).toThrow(/stats\.total/);
  });

  it('rejects a completed count that does not match the issue list', () => {
    expect(() => validateSnapshot(broken((s) => (s.stats.completed = 3)))).toThrow(/stats\.completed/);
  });

  it('rejects issues that are not sorted newest first', () => {
    const value = broken((s) => s.issues.reverse());
    expect(() => validateSnapshot(value)).toThrow(/not sorted/);
  });

  it('rejects duplicate issue ids', () => {
    expect(() => validateSnapshot(broken((s) => (s.issues[1].id = s.issues[0].id)))).toThrow(/duplicates/);
  });

  it('rejects an unknown closureReason value', () => {
    expect(() => validateSnapshot(broken((s) => (s.issues[0].closureReason = 'DONE')))).toThrow(/closureReason/);
  });

  it('rejects COMPLETED when the raw value says otherwise', () => {
    const value = broken((s) => {
      const completed = s.issues.find((i: any) => i.closureReason === 'COMPLETED');
      completed.rawClosureReason = null;
    });
    expect(() => validateSnapshot(value)).toThrow(/rawClosureReason/);
  });

  it('rejects a non-http issue URL', () => {
    expect(() => validateSnapshot(broken((s) => (s.issues[0].url = 'javascript:alert(1)')))).toThrow(/url/);
  });

  it('rejects an invalid closedAt', () => {
    expect(() => validateSnapshot(broken((s) => (s.issues[0].closedAt = 'yesterday')))).toThrow(/closedAt/);
  });

  it('lists every independent problem it finds', () => {
    // The issues stay valid, so the stats cross-check still runs alongside the owner check.
    const value = broken((s) => {
      delete s.repository.owner;
      s.stats.total = 99;
    });
    try {
      validateSnapshot(value);
      expect.unreachable('validateSnapshot should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SnapshotValidationError);
      const problems = (error as SnapshotValidationError).problems;
      expect(problems).toHaveLength(2);
      expect(problems.join('\n')).toMatch(/repository\.owner/);
      expect(problems.join('\n')).toMatch(/stats\.total/);
    }
  });

  it('skips the stats cross-check when an issue is structurally invalid', () => {
    const value = broken((s) => {
      s.issues[0].url = 'nope';
      s.stats.total = 99;
    });
    try {
      validateSnapshot(value);
      expect.unreachable('validateSnapshot should have thrown');
    } catch (error) {
      const problems = (error as SnapshotValidationError).problems;
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/url/);
    }
  });
});

describe('parseRepository', () => {
  it('splits owner and name', () => {
    expect(parseRepository('acme/widgets')).toEqual({ owner: 'acme', name: 'widgets' });
  });

  it.each([undefined, '', 'acme', 'a/b/c', '/widgets', 'acme/'])('rejects %j', (value) => {
    expect(() => parseRepository(value)).toThrow(/owner\/name/);
  });
});

describe('assertTokenNotPresent', () => {
  it('throws when the output contains the token', () => {
    expect(() => assertTokenNotPresent('{"x":"ghs_secret"}', 'ghs_secret')).toThrow(/token/);
  });

  it('passes when the token is absent', () => {
    expect(() => assertTokenNotPresent(JSON.stringify(build().snapshot), 'ghs_secret')).not.toThrow();
  });
});