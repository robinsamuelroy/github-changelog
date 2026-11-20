import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ChangelogService } from './core/changelog.service';
import { ChangelogHeader } from './features/changelog/changelog-header';
import { ChangelogList } from './features/changelog/changelog-list';
import { StatsSummary } from './features/changelog/stats-summary';

@Component({
  selector: 'app-root',
  imports: [ChangelogHeader, StatsSummary, ChangelogList],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly changelog = inject(ChangelogService);

  protected readonly snapshot = computed(() => {
    const state = this.changelog.state();
    return state.status === 'ready' ? state.snapshot : null;
  });

  protected readonly errorMessage = computed(() => {
    const state = this.changelog.state();
    return state.status === 'error' ? state.message : null;
  });

  constructor() {
    void this.changelog.load();
  }

  protected retry(): void {
    void this.changelog.load();
  }
}