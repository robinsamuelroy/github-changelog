import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { SnapshotIssue } from '../../core/snapshot.model';
import { closureLabel, formatClosed, labelColor } from './issue-display';

@Component({
  selector: 'app-issue-item',
  templateUrl: './issue-item.html',
  styleUrl: './issue-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IssueItem {
  readonly issue = input.required<SnapshotIssue>();

  protected readonly labelColor = labelColor;

  protected readonly reasonLabel = computed(() => closureLabel(this.issue()));
  protected readonly closed = computed(() => formatClosed(this.issue().closedAt));
  /** Used for CSS classes: completed, not-planned or unknown. */
  protected readonly modifier = computed(() =>
    this.issue().closureReason.toLowerCase().replace('_', '-'),
  );
  protected readonly icon = computed(() => {
    switch (this.issue().closureReason) {
      case 'COMPLETED':
        return '✓';
      case 'NOT_PLANNED':
        return '–';
      default:
        return '?';
    }
  });
  protected readonly initial = computed(
    () => this.issue().author?.login.charAt(0).toUpperCase() ?? '?',
  );
}