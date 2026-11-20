import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import type { ClosureReason } from '../../core/snapshot.model';
import { hasActiveFilters, NO_FILTERS, type IssueFilters } from './changelog.utils';

interface ReasonOption {
  value: ClosureReason | 'ALL';
  label: string;
}

@Component({
  selector: 'app-filter-bar',
  templateUrl: './filter-bar.html',
  styleUrl: './filter-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterBar {
  readonly filters = model.required<IssueFilters>();
  readonly labels = input<string[]>([]);
  /** Show the "Other" button only when some issue has an unknown closure reason. */
  readonly showOther = input(false);
  readonly shown = input.required<number>();
  readonly total = input.required<number>();

  protected readonly reasons = computed<ReasonOption[]>(() => {
    const options: ReasonOption[] = [
      { value: 'ALL', label: 'All' },
      { value: 'COMPLETED', label: 'Completed' },
      { value: 'NOT_PLANNED', label: 'Not planned' },
    ];
    if (this.showOther()) options.push({ value: 'UNKNOWN', label: 'Other' });
    return options;
  });

  protected readonly active = computed(() => hasActiveFilters(this.filters()));

  protected readonly summary = computed(() => {
    const total = this.total();
    if (this.active()) return `Showing ${this.shown()} of ${total} issues`;
    return `${total} closed ${total === 1 ? 'issue' : 'issues'}`;
  });

  protected setQuery(query: string): void {
    this.filters.update((f) => ({ ...f, query }));
  }

  protected setReason(reason: ClosureReason | 'ALL'): void {
    this.filters.update((f) => ({ ...f, reason }));
  }

  protected setLabel(value: string): void {
    this.filters.update((f) => ({ ...f, label: value === '' ? null : value }));
  }

  protected clear(): void {
    this.filters.set(NO_FILTERS);
  }
}