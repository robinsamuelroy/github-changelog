import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { SnapshotStats } from '../../core/snapshot.model';

@Component({
  selector: 'app-stats-summary',
  templateUrl: './stats-summary.html',
  styleUrl: './stats-summary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsSummary {
  readonly stats = input.required<SnapshotStats>();
}