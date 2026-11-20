import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { ChangelogService } from './core/changelog.service';

function snapshotJson(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

/** Stubs fetch, creates the app, and waits until loading has finished. */
async function render(fetchImpl: () => Promise<Response>): Promise<HTMLElement> {
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  const fixture = TestBed.createComponent(App);
  await TestBed.inject(ChangelogService).load();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const text = (root: HTMLElement, selector: string) =>
  root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a loading state while the snapshot is being fetched', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Loading changelog');
  });

  it('shows the repository, Angular version and update time from the snapshot', async () => {
    const root = await render(async () => json(snapshotJson()));
    const link = root.querySelector<HTMLAnchorElement>('.title a');
    expect(link?.getAttribute('href')).toBe('https://github.com/acme/widgets');
    expect(text(root, '.title a')).toBe('acme/widgets');
    expect(text(root, '.chip-value')).toBe('v22.3.0');
    expect(root.textContent).toContain('Nov 20, 2026');
    expect(root.textContent).toContain('UTC');
  });

  it('shows total, completed and not planned counts', async () => {
    const root = await render(async () => json(snapshotJson()));
    expect(text(root, '.card--total .value')).toBe('3');
    expect(text(root, '.card--completed .value')).toBe('2');
    expect(text(root, '.card--not-planned .value')).toBe('1');
    expect(root.querySelector('.card--unknown')).toBeNull();
  });

  it('shows an extra card only when issues have an unknown closure reason', async () => {
    const root = await render(async () =>
      json(snapshotJson({ stats: { total: 3, completed: 1, notPlanned: 1, unknown: 1 } })),
    );
    expect(text(root, '.card--unknown .value')).toBe('1');
  });

  it('shows an empty state and zero counts for a repository with no closed issues', async () => {
    const root = await render(async () =>
      json(snapshotJson({ issues: [], stats: { total: 0, completed: 0, notPlanned: 0, unknown: 0 } })),
    );
    expect(text(root, '.state--empty')).toContain('No closed issues yet');
    expect(text(root, '.card--total .value')).toBe('0');
  });

  it('shows an error when the snapshot file is missing', async () => {
    const root = await render(async () => new Response('', { status: 404 }));
    expect(text(root, '[role="alert"]')).toContain('HTTP 404');
  });

  it('shows an error when the snapshot has an unexpected format', async () => {
    const root = await render(async () => json({ hello: 'world' }));
    expect(text(root, '[role="alert"]')).toContain('unexpected format');
  });

  it('shows an error when the response is not JSON', async () => {
    const root = await render(async () => new Response('<html>', { status: 200 }));
    expect(text(root, '[role="alert"]')).toContain('not valid JSON');
  });

  it('shows an error when the network request fails', async () => {
    const root = await render(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(text(root, '[role="alert"]')).toContain('Could not reach');
  });
});