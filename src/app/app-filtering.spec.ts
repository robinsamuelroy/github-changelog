import { ComponentFixture, TestBed } from '@angular/core/testing';
import { App } from './app';
import { ChangelogService } from './core/changelog.service';

const snapshot = {
  schemaVersion: 1,
  generatedAt: '2026-11-20T12:00:00.000Z',
  repository: { owner: 'acme', name: 'widgets', url: 'https://github.com/acme/widgets' },
  angularVersion: '22.3.0',
  stats: { total: 3, completed: 2, notPlanned: 1, unknown: 0 },
  issues: [1, 2, 3].map((n) => ({
    id: `I_${n}`,
    number: n,
    title: `Issue ${n}`,
    url: `https://github.com/acme/widgets/issues/${n}`,
    author: { login: 'octocat', avatarUrl: null },
    labels: [],
    closedAt: `2026-03-0${n}T10:00:00.000Z`,
    closureReason: n === 3 ? 'NOT_PLANNED' : 'COMPLETED',
    rawClosureReason: n === 3 ? 'NOT_PLANNED' : 'COMPLETED',
  })),
};

async function settle(fixture: ComponentFixture<App>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

const count = (root: HTMLElement, card: string) =>
  root.querySelector(`.${card} .value`)?.textContent?.trim();

describe('App filtering', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(snapshot), { status: 200 })));
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the summary statistics unchanged while searching and filtering', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(ChangelogService).load();
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelectorAll('.issue')).toHaveLength(3);

    const input = root.querySelector('#issue-search') as HTMLInputElement;
    input.value = 'zzz-no-match';
    input.dispatchEvent(new Event('input'));
    await settle(fixture);

    expect(root.querySelectorAll('.issue')).toHaveLength(0);
    expect(root.textContent).toContain('No issues match your filters');
    expect(count(root, 'card--total')).toBe('3');
    expect(count(root, 'card--completed')).toBe('2');
    expect(count(root, 'card--not-planned')).toBe('1');
  });

  it('keeps the statistics unchanged after a reason filter', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(ChangelogService).load();
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;

    const button = Array.from(root.querySelectorAll<HTMLButtonElement>('.seg')).find(
      (b) => b.textContent?.trim() === 'Not planned',
    );
    button?.click();
    await settle(fixture);

    expect(root.querySelectorAll('.issue')).toHaveLength(1);
    expect(count(root, 'card--total')).toBe('3');
    expect(count(root, 'card--completed')).toBe('2');
  });
});