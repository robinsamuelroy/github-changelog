# Repository Changelog

An Angular app that shows a changelog of the GitHub repository it lives in: every **closed issue**, grouped by the month it was closed, newest first. It is deployed to GitHub Pages by GitHub Actions.

For each issue it shows the number, the title (linking to GitHub), labels, author, closed date, and whether it was closed **as completed** or **as not planned** (different colour, icon and text). The top of the page shows the total and the completed / not planned split. If there are no closed issues, the page says so.

## How it works

The site is static. Data is fetched at deploy time, not in the browser, so no token is ever needed by visitors.

1. `scripts/generate-changelog.mts` reads `GITHUB_REPOSITORY` (`owner/name`) from the environment, queries the **GitHub GraphQL API** for all `CLOSED` issues with cursor pagination (100 per page, so repositories with more than 100 closed issues are fully covered), and fails rather than write partial data.
2. It normalizes the issues (`stateReason` → completed / not planned), computes the stats, validates the result and writes `public/changelog.json`. It refuses to write the file if it contains the token.
3. `ng build` bundles the Angular app, copying `changelog.json` next to it.
4. In the browser the app fetches `changelog.json` (relative URL, `cache: 'no-cache'`), so a normal reload after a redeploy shows the new data.

Nothing is tied to an account or repository: owner and name come from `GITHUB_REPOSITORY`, and `<base href="./">` plus relative URLs make the build work under any `/<repo>/` Pages path.

## Deploy

1. Push this repository to GitHub (public).
2. **Settings → Pages → Source: GitHub Actions.**
3. **Actions → "Deploy changelog to GitHub Pages" → Run workflow.** (The first run triggered by the push fails if Pages was not enabled yet; just run it again.)
4. Open the site URL shown in the deploy job.

The workflow (`.github/workflows/deploy.yml`) runs on every push to the default branch and manually via **Run workflow**. To refresh the changelog after closing issues, run it again; no code change is needed.

### Credentials

Only the automatic `GITHUB_TOKEN` is used (`permissions: contents: read, issues: read, pages: write, id-token: write`). No personal access tokens and no repository secrets. The token is only passed to the generator step; it is never written to the site (checked at generation time, and `persist-credentials: false` on checkout).

## Local development

Requires Node 22.18+ (24 recommended).

```bash
npm ci
npm run sample     # writes a sample public/changelog.json (fake data)
npm start          # http://localhost:4200
```

To use real data: `GITHUB_TOKEN=<token> GITHUB_REPOSITORY=owner/name npm run generate`.

`public/changelog.json` is generated and git-ignored.

## Tests

```bash
npm test                 # Angular unit tests (Vitest)
npm run test:generator   # generator tests: pagination, normalization, validation
npm run typecheck:scripts
```

## Assumptions

- "Closed as completed / not planned" comes from GitHub's `stateReason`. Any other reason (e.g. `DUPLICATE`) is shown separately as "Other reason" and counted in the total.
- Months are grouped by the closing date in UTC.
