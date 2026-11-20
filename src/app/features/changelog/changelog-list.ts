import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { SnapshotIssue } from '../../core/snapshot.model';
import {
  collectLabels,
  filterIssues,
  groupByMonth,
  NO_FILTERS,
  type IssueFilters,
} from './changelog.utils';
import { FilterBar } from './filter-bar';
import { IssueItem } from './issue-item';

@Component({
  selector: 'app-changelog-list',
  imports: [FilterBar, IssueItem],
  templateUrl: './changelog-list.html',
  styleUrl: './changelog-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangelogList {
  readonly issues = input.required<readonly SnapshotIssue[]>();

  /** Filter state lives here only, so it can never affect the page-level summary statistics. */
  protected readonly filters = signal<IssueFilters>(NO_FILTERS);

  protected readonly labels = computed(() => collectLabels(this.issues()));
  protected readonly hasUnknown = computed(() =>
    this.issues().some((issue) => issue.closureReason === 'UNKNOWN'),
  );
  protected readonly filtered = computed(() => filterIssues(this.issues(), this.filters()));
  protected readonly groups = computed(() => groupByMonth(this.filtered()));

  protected clear(): void {
    this.filters.set(NO_FILTERS);
  }
}