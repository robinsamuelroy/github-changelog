# Notes

> DRAFT: rewrite this in your own words before sending. The facts below are what was found while reviewing.

## Approach
- Static site: a Node script fetches all closed issues via GraphQL (cursor pagination) at deploy time and writes `changelog.json`; the Angular app only renders it.
- Repo-agnostic: owner/name from `GITHUB_REPOSITORY`, relative URLs and `<base href="./">`.
- Token handling: only `GITHUB_TOKEN`, passed to one step, and the generator refuses to write output containing it.

## What the AI got wrong / what I caught
- `src/index.html` had `<base href="/">`. On a project Pages site (`/repo/`) the JS and CSS would 404. Changed to `./`.
- The workflow was missing. `$default-branch` only works in workflow templates, so the workflow triggers on all pushes and gates the job on `github.event.repository.default_branch`.
- <add your own: what you caught while prompting/debugging>

## Not verified
- I could not run `ng build` / `ng test` in the review environment (Windows `node_modules`, no network). Run `npm ci && npm test && npm run test:generator && npx ng build` once locally. The generator was tested against a mock GraphQL server with 250 issues (3 pages).

## With more time
- A real end-to-end run on a throwaway repo with issues closed as completed / not planned.
- Show the generated-at time more prominently; add a scheduled refresh.
