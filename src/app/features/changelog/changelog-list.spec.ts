import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { SnapshotIssue } from '../../core/snapshot.model';
import { ChangelogList } from './changelog-list';

function issue(number: number, overrides: Partial<SnapshotIssue> = {}): SnapshotIssue {
  return {
    id: `I_${number}`,
    number,
    title: `Issue ${number}`,
    url: `https://github.com/acme/widgets/issues/${number}`,
    author: { login: 'octocat', avatarUrl: null },
    labels: [],
    closedAt: '2026-03-15T10:00:00.000Z',
    closureReason: 'COMPLETED',
    rawClosureReason: 'COMPLETED',
    ...overrides,
  };
}

const ISSUES: SnapshotIssue[] = [
  issue(1, {
    title: 'Fix login bug',
    closedAt: '2026-01-05T10:00:00.000Z',
    author: { login: 'alice', avatarUrl: null },
    labels: [{ name: 'bug', color: 'd73a4a' }],
  }),
  issue(2, {
    title: 'Add dark mode',
    closedAt: '2026-03-02T10:00:00.000Z',
    author: { login: 'bob', avatarUrl: null },
    closureReason: 'NOT_PLANNED',
    rawClosureReason: 'NOT_PLANNED',
    labels: [{ name: 'feature', color: '0e8a16' }],
  }),
  issue(3, {
    title: 'Speed up startup',
    closedAt: '2026-03-20T10:00:00.000Z',
    author: null,
    closureReason: 'UNKNOWN',
    rawClosureReason: 'DUPLICATE',
  }),
];

type Fixture = ComponentFixture<ChangelogList>;

async function settle(fixture: Fixture): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

async function render(issues: SnapshotIssue[] = ISSUES) {
  const fixture = TestBed.createComponent(ChangelogList);
  fixture.componentRef.setInput('issues', issues);
  await settle(fixture);
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

const all = (root: HTMLElement, selector: string) =>
  Array.from(root.querySelectorAll<HTMLElement>(selector));
const norm = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();
const numbers = (root: HTMLElement) => all(root, '.number').map((el) => norm(el));

async function type(fixture: Fixture, root: HTMLElement, value: string) {
  const input = root.querySelector('#issue-search') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle(fixture);
}

async function press(fixture: Fixture, root: HTMLElement, label: string) {
  const button = all(root, '.seg').find((b) => norm(b) === label);
  if (!button) throw new Error(`No button named ${label}`);
  button.click();
  await settle(fixture);
}

describe('ChangelogList', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ChangelogList] }).compileComponents();
  });

  it('groups issues by month with the newest month first and a count', async () => {
    const { root } = await render();
    const titles = all(root, '.month-title').map((el) => norm(el));
    expect(titles).toHaveLength(2);
    expect(titles[0]).toMatch(/^March 2026\s*2 issues$/);
    expect(titles[1]).toMatch(/^January 2026\s*1 issue$/);
  });

  it('shows the newest issue first inside a month', async () => {
    const { root } = await render();
    expect(numbers(root)).toEqual(['#3', '#2', '#1']);
  });

  it('links each title to the original GitHub issue', async () => {
    const { root } = await render();
    const link = all(root, '.link')[0] as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://github.com/acme/widgets/issues/3');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(norm(link)).toContain('Speed up startup');
  });

  it('shows a different badge for each closure reason', async () => {
    const { root } = await render();
    const badges = all(root, '.badge').map((el) => norm(el));
    expect(badges[0]).toContain('Duplicate');
    expect(badges[1]).toContain('Not planned');
    expect(badges[2]).toContain('Completed');
    expect(all(root, '.badge--completed')).toHaveLength(1);
    expect(all(root, '.badge--not-planned')).toHaveLength(1);
    expect(all(root, '.badge--unknown')).toHaveLength(1);
  });

  it('shows labels, author, and a fallback when the author is missing', async () => {
    const { root } = await render();
    expect(norm(all(root, '.labels')[1])).toContain('bug');
    expect(norm(all(root, '.meta')[2])).toContain('alice');
    expect(norm(all(root, '.meta')[0])).toContain('Unknown author');
  });

  it('shows the closure time in UTC', async () => {
    const { root } = await render();
    const time = all(root, 'time')[0] as HTMLTimeElement;
    expect(time.getAttribute('datetime')).toBe('2026-03-20T10:00:00.000Z');
    expect(norm(time)).toMatch(/^Mar 20, 2026, 10:00\sAM UTC$/);
  });

  it('shows the total when no filter is active', async () => {
    const { root } = await render();
    expect(norm(root.querySelector('.count'))).toBe('3 closed issues');
    expect(root.querySelector('.clear')).toBeNull();
  });

  it('searches by title', async () => {
    const { fixture, root } = await render();
    await type(fixture, root, 'login');
    expect(numbers(root)).toEqual(['#1']);
    expect(norm(root.querySelector('.count'))).toBe('Showing 1 of 3 issues');
  });

  it('searches by issue number', async () => {
    const { fixture, root } = await render();
    await type(fixture, root, '#2');
    expect(numbers(root)).toEqual(['#2']);
  });

  it('searches by author', async () => {
    const { fixture, root } = await render();
    await type(fixture, root, 'bob');
    expect(numbers(root)).toEqual(['#2']);
  });

  it('filters by closure reason', async () => {
    const { fixture, root } = await render();
    await press(fixture, root, 'Not planned');
    expect(numbers(root)).toEqual(['#2']);
    const pressed = all(root, '.seg').find((b) => norm(b) === 'Not planned');
    expect(pressed?.getAttribute('aria-pressed')).toBe('true');
  });

  it('filters issues with another closure reason through the Other button', async () => {
    const { fixture, root } = await render();
    await press(fixture, root, 'Other');
    expect(numbers(root)).toEqual(['#3']);
  });

  it('filters by label', async () => {
    const { fixture, root } = await render();
    const select = root.querySelector('#issue-label') as HTMLSelectElement;
    select.value = 'bug';
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(numbers(root)).toEqual(['#1']);
  });

  it('combines search and reason filters', async () => {
    const { fixture, root } = await render();
    await type(fixture, root, 'a');
    await press(fixture, root, 'Completed');
    expect(numbers(root)).toEqual(['#1']);
  });

  it('shows a no-results state and no month sections when nothing matches', async () => {
    const { fixture, root } = await render();
    await type(fixture, root, 'zzz');
    expect(norm(root.querySelector('.empty'))).toContain('No issues match your filters');
    expect(root.querySelector('.month')).toBeNull();
  });

  it('restores everything when the filters are cleared from the no-results state', async () => {
    const { fixture, root } = await render();
    await type(fixture, root, 'zzz');
    (root.querySelector('.empty .button') as HTMLButtonElement).click();
    await settle(fixture);
    expect(numbers(root)).toEqual(['#3', '#2', '#1']);
    expect((root.querySelector('#issue-search') as HTMLInputElement).value).toBe('');
  });

  it('offers Clear filters only while a filter is active', async () => {
    const { fixture, root } = await render();
    expect(root.querySelector('.clear')).toBeNull();
    await type(fixture, root, 'bob');
    expect(root.querySelector('.clear')).not.toBeNull();
    (root.querySelector('.clear') as HTMLButtonElement).click();
    await settle(fixture);
    expect(numbers(root)).toHaveLength(3);
  });

  it('hides the Other button and label menu when they would be empty', async () => {
    const plain = [issue(1), issue(2, { closedAt: '2026-02-01T10:00:00.000Z' })];
    const { root } = await render(plain);
    expect(all(root, '.seg').map((b) => norm(b))).toEqual(['All', 'Completed', 'Not planned']);
    expect(root.querySelector('#issue-label')).toBeNull();
  });
});