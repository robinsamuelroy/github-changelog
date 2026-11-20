import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { assertTokenNotPresent, buildSnapshot, parseRepository } from './build-snapshot.mts';
import { fetchClosedIssues } from './github-graphql.mts';

/** Reads the installed Angular version, so the displayed value is not hardcoded. */
async function readAngularVersion(): Promise<string> {
  const file = resolve(import.meta.dirname, '..', 'node_modules', '@angular', 'core', 'package.json');
  const pkg = JSON.parse(await readFile(file, 'utf8')) as { version?: unknown };
  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    throw new Error(`Could not read the Angular version from ${file}`);
  }
  return pkg.version;
}

async function main(): Promise<void> {
  const token = process.env['GITHUB_TOKEN'];
  if (!token) {
    throw new Error('GITHUB_TOKEN is not set. In GitHub Actions, pass it with env: GITHUB_TOKEN: ${{ github.token }}');
  }
  const { owner, name } = parseRepository(process.env['GITHUB_REPOSITORY']);
  const endpoint = process.env['GITHUB_GRAPHQL_URL'] || undefined;
  const outputPath = resolve(
    process.argv[2] ?? resolve(import.meta.dirname, '..', 'public', 'changelog.json'),
  );

  const [angularVersion, fetched] = await Promise.all([
    readAngularVersion(),
    fetchClosedIssues({ token, owner, name, endpoint }),
  ]);

  const { snapshot, duplicatesRemoved } = buildSnapshot({
    owner,
    name,
    repositoryUrl: fetched.repositoryUrl,
    angularVersion,
    nodes: fetched.nodes,
  });

  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  assertTokenNotPresent(json, token);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, json, 'utf8');

  const { total, completed, notPlanned, unknown } = snapshot.stats;
  console.log(
    `Snapshot written to ${outputPath}\n` +
      `  repository: ${owner}/${name}\n` +
      `  closed issues: ${total} (completed ${completed}, not planned ${notPlanned}, unknown ${unknown})\n` +
      `  pages fetched: ${fetched.pagesFetched}, duplicates removed: ${duplicatesRemoved}\n` +
      `  angular: ${angularVersion}`,
  );
}

main().catch((error: unknown) => {
  console.error(`generate-changelog failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});