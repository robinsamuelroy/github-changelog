import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildSnapshot } from './build-snapshot.mts';
import type { RawIssueNode } from './normalize-issues.mts';

const OWNER = 'sample-owner';
const NAME = 'sample-repo';

const TITLES = [
  'Fix crash when saving an empty form',
  'Add dark mode toggle',
  'Support CSV export',
  'Improve startup performance',
  'Update contributor guide',
  'Handle expired sessions gracefully',
  'Rename the settings page',
  'Investigate memory growth in the worker',
];
const REASONS: Array<string | null> = ['COMPLETED', 'COMPLETED', 'NOT_PLANNED', 'COMPLETED', 'DUPLICATE', 'NOT_PLANNED', null];
const AUTHORS = ['alice', 'bob', 'carol', null, 'dave'];
const LABEL_SETS = [
  [{ name: 'bug', color: 'd73a4a' }],
  [{ name: 'enhancement', color: 'a2eeef' }, { name: 'ui', color: '7057ff' }],
  [],
  [{ name: 'documentation', color: '0075ca' }],
  [{ name: 'bug', color: 'd73a4a' }, { name: 'performance', color: 'fbca04' }],
];

function sampleNodes(count: number): RawIssueNode[] {
  return Array.from({ length: count }, (_, k) => {
    const number = k + 1;
    const login = AUTHORS[k % AUTHORS.length] ?? null;
    return {
      id: `SAMPLE_${number}`,
      number,
      title: `${TITLES[k % TITLES.length] ?? 'Sample issue'} (#${number})`,
      url: `https://github.com/${OWNER}/${NAME}/issues/${number}`,
      closedAt: new Date(Date.UTC(2026, 1 + (k % 10), 1 + ((k * 3) % 27), (k * 7) % 24, (k * 11) % 60)).toISOString(),
      stateReason: REASONS[k % REASONS.length] ?? null,
      author: login ? { login, avatarUrl: null } : null,
      labels: { nodes: LABEL_SETS[k % LABEL_SETS.length] ?? [] },
    };
  });
}

async function main(): Promise<void> {
  const pkgPath = resolve(import.meta.dirname, '..', 'node_modules', '@angular', 'core', 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { version: string };

  const { snapshot } = buildSnapshot({
    owner: OWNER,
    name: NAME,
    repositoryUrl: `https://github.com/${OWNER}/${NAME}`,
    angularVersion: pkg.version,
    nodes: sampleNodes(30),
  });

  const outputPath = resolve(import.meta.dirname, '..', 'public', 'changelog.json');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`Wrote FAKE sample data (${snapshot.stats.total} issues) to ${outputPath}`);
  console.log('This file is git-ignored. The real workflow replaces it with live data.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});