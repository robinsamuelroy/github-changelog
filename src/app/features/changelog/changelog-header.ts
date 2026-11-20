import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Snapshot } from '../../core/snapshot.model';

const updatedFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

@Component({
  selector: 'app-changelog-header',
  templateUrl: './changelog-header.html',
  styleUrl: './changelog-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangelogHeader {
  readonly snapshot = input.required<Snapshot>();

  protected readonly updated = computed(
    () => `${updatedFormatter.format(new Date(this.snapshot().generatedAt))} UTC`,
  );
}