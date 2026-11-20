import type { ClosureReason, SnapshotIssue } from '../../core/snapshot.model';

export interface MonthGroup {
  /** 'YYYY-MM', the UTC month of closure. */
  key: string;
  /** For example "March 2026". */
  label: string;
  issues: SnapshotIssue[];
}

export interface IssueFilters {
  query: string;
  reason: ClosureReason | 'ALL';
  label: string | null;
}

export const NO_FILTERS: IssueFilters = { query: '', reason: 'ALL', label: null };

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** UTC month key. Grouping always uses UTC so the result never depends on the viewer's timezone. */
export function monthKey(closedAt: string): string {
  return new Date(closedAt).toISOString().slice(0, 7);
}

function monthLabel(key: string): string {
  return monthFormatter.format(new Date(`${key}-01T00:00:00Z`));
}

/** Groups by closure month: newest month first, newest issue first inside each month. */
export function groupByMonth(issues: readonly SnapshotIssue[]): MonthGroup[] {
  const sorted = [...issues].sort((a, b) => {
    const diff = Date.parse(b.closedAt) - Date.parse(a.closedAt);
    return diff !== 0 ? diff : b.number - a.number;
  });

  const groups = new Map<string, MonthGroup>();
  for (const issue of sorted) {
    const key = monthKey(issue.closedAt);
    let group = groups.get(key);
    if (!group) {
      group = { key, label: monthLabel(key), issues: [] };
      groups.set(key, group);
    }
    group.issues.push(issue);
  }
  return [...groups.values()];
}

/** All active filters must match. Search covers title, issue number and author login. */
export function filterIssues(
  issues: readonly SnapshotIssue[],
  filters: IssueFilters,
): SnapshotIssue[] {
  const query = filters.query.trim().replace(/^#/, '').toLowerCase();

  return issues.filter((issue) => {
    if (filters.reason !== 'ALL' && issue.closureReason !== filters.reason) return false;
    if (filters.label !== null && !issue.labels.some((l) => l.name === filters.label)) return false;
    if (query === '') return true;
    return (
      issue.title.toLowerCase().includes(query) ||
      String(issue.number).includes(query) ||
      (issue.author?.login.toLowerCase().includes(query) ?? false)
    );
  });
}

export function hasActiveFilters(filters: IssueFilters): boolean {
  return filters.query.trim() !== '' || filters.reason !== 'ALL' || filters.label !== null;
}

/** Unique label names across all issues, sorted alphabetically. */
export function collectLabels(issues: readonly SnapshotIssue[]): string[] {
  const names = new Set<string>();
  for (const issue of issues) {
    for (const label of issue.labels) names.add(label.name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}