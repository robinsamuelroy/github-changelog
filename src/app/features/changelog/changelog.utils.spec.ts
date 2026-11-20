import type { SnapshotIssue } from '../../core/snapshot.model';
import {
  collectLabels,
  filterIssues,
  groupByMonth,
  hasActiveFilters,
  monthKey,
  NO_FILTERS,
} from './changelog.utils';

function issue(overrides: Partial<SnapshotIssue> & { number: number }): SnapshotIssue {
  return {
    id: `I_${overrides.number}`,
    title: `Issue ${overrides.number}`,
    url: `https://github.com/acme/widgets/issues/${overrides.number}`,
    author: { login: 'octocat', avatarUrl: null },
    labels: [],
    closedAt: '2026-03-15T10:00:00.000Z',
    closureReason: 'COMPLETED',
    rawClosureReason: 'COMPLETED',
    ...overrides,
  };
}

describe('monthKey', () => {
  it('uses the UTC month, not the local one', () => {
    expect(monthKey('2026-03-31T23:30:00.000Z')).toBe('2026-03');
    expect(monthKey('2026-04-01T00:30:00.000Z')).toBe('2026-04');
  });

  it('converts offsets to UTC first', () => {
    // 01:00 on 1 April at +02:00 is still 31 March in UTC.
    expect(monthKey('2026-04-01T01:00:00+02:00')).toBe('2026-03');
  });
});

describe('groupByMonth', () => {
  it('returns no groups for no issues', () => {
    expect(groupByMonth([])).toEqual([]);
  });

  it('puts the newest month first and the newest issue first inside each month', () => {
    const groups = groupByMonth([
      issue({ number: 1, closedAt: '2026-01-05T00:00:00.000Z' }),
      issue({ number: 2, closedAt: '2026-03-02T00:00:00.000Z' }),
      issue({ number: 3, closedAt: '2026-03-20T00:00:00.000Z' }),
      issue({ number: 4, closedAt: '2025-12-31T23:59:59.000Z' }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['2026-03', '2026-01', '2025-12']);
    expect(groups[0]?.issues.map((i) => i.number)).toEqual([3, 2]);
  });

  it('labels months in English with the year', () => {
    const groups = groupByMonth([issue({ number: 1, closedAt: '2026-03-15T10:00:00.000Z' })]);
    expect(groups[0]?.label).toBe('March 2026');
  });

  it('splits issues across the UTC month boundary', () => {
    const groups = groupByMonth([
      issue({ number: 1, closedAt: '2026-03-31T23:59:59.000Z' }),
      issue({ number: 2, closedAt: '2026-04-01T00:00:00.000Z' }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['2026-04', '2026-03']);
  });

  it('does not change the input array', () => {
    const input = [
      issue({ number: 1, closedAt: '2026-01-05T00:00:00.000Z' }),
      issue({ number: 2, closedAt: '2026-03-02T00:00:00.000Z' }),
    ];
    groupByMonth(input);
    expect(input.map((i) => i.number)).toEqual([1, 2]);
  });
});

describe('filterIssues', () => {
  const issues = [
    issue({ number: 12, title: 'Fix login bug', author: { login: 'alice', avatarUrl: null }, labels: [{ name: 'bug', color: 'f00' }] }),
    issue({ number: 34, title: 'Add dark mode', author: { login: 'bob', avatarUrl: null }, closureReason: 'NOT_PLANNED', rawClosureReason: 'NOT_PLANNED', labels: [{ name: 'feature', color: '0f0' }] }),
    issue({ number: 56, title: 'Odd data', author: null, closureReason: 'UNKNOWN', rawClosureReason: null }),
  ];

  const numbers = (filters: Partial<typeof NO_FILTERS>) =>
    filterIssues(issues, { ...NO_FILTERS, ...filters }).map((i) => i.number);

  it('returns everything with no filters', () => {
    expect(numbers({})).toEqual([12, 34, 56]);
  });

  it('searches titles case-insensitively', () => {
    expect(numbers({ query: 'LOGIN' })).toEqual([12]);
  });

  it('searches by issue number, with or without #', () => {
    expect(numbers({ query: '34' })).toEqual([34]);
    expect(numbers({ query: '#34' })).toEqual([34]);
  });

  it('searches by author and skips issues with no author', () => {
    expect(numbers({ query: 'bob' })).toEqual([34]);
  });

  it('filters by closure reason', () => {
    expect(numbers({ reason: 'NOT_PLANNED' })).toEqual([34]);
    expect(numbers({ reason: 'UNKNOWN' })).toEqual([56]);
  });

  it('filters by label', () => {
    expect(numbers({ label: 'bug' })).toEqual([12]);
  });

  it('combines filters with AND', () => {
    expect(numbers({ query: 'a', reason: 'COMPLETED', label: 'bug' })).toEqual([12]);
    expect(numbers({ reason: 'NOT_PLANNED', label: 'bug' })).toEqual([]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(numbers({ query: 'zzz' })).toEqual([]);
  });
});

describe('hasActiveFilters', () => {
  it('is false for the default filters and for whitespace-only search', () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...NO_FILTERS, query: '   ' })).toBe(false);
  });

  it('is true when any filter is set', () => {
    expect(hasActiveFilters({ ...NO_FILTERS, query: 'x' })).toBe(true);
    expect(hasActiveFilters({ ...NO_FILTERS, reason: 'COMPLETED' })).toBe(true);
    expect(hasActiveFilters({ ...NO_FILTERS, label: 'bug' })).toBe(true);
  });
});

describe('collectLabels', () => {
  it('returns unique label names, sorted', () => {
    const labels = collectLabels([
      issue({ number: 1, labels: [{ name: 'feature', color: '0f0' }, { name: 'bug', color: 'f00' }] }),
      issue({ number: 2, labels: [{ name: 'bug', color: 'f00' }] }),
    ]);
    expect(labels).toEqual(['bug', 'feature']);
  });

  it('returns an empty list when there are no labels', () => {
    expect(collectLabels([issue({ number: 1 })])).toEqual([]);
  });
});