import type { RawIssueNode } from './normalize-issues.mts';

export const DEFAULT_GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';
export const PAGE_SIZE = 100;

export const CLOSED_ISSUES_QUERY = `
query ClosedIssues($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    url
    issues(states: CLOSED, first: ${PAGE_SIZE}, after: $after, orderBy: { field: CREATED_AT, direction: ASC }) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        number
        title
        url
        closedAt
        stateReason
        author { login avatarUrl }
        labels(first: 100) { nodes { name color } }
      }
    }
  }
}`;

export class GitHubApiError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
  }
}

export interface FetchClosedIssuesOptions {
  /** The GitHub Actions GITHUB_TOKEN. Never logged or included in output. */
  token: string;
  owner: string;
  name: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  /** Safety limit on pages, to guarantee termination. */
  maxPages?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface FetchClosedIssuesResult {
  repositoryUrl: string;
  nodes: RawIssueNode[];
  pagesFetched: number;
  totalCount: number;
}

interface GraphQLResponse {
  data?: {
    repository: {
      url: string;
      issues: {
        totalCount: number;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<RawIssueNode | null> | null;
      };
    } | null;
  } | null;
  errors?: Array<{ message: string; type?: string }>;
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRY_AFTER_MS = 60_000;

function isRetryable(response: Response): boolean {
  if (RETRYABLE_STATUSES.has(response.status)) return true;
  // Secondary rate limits come back as 403 with a Retry-After header.
  return response.status === 403 && response.headers.get('retry-after') !== null;
}

function retryDelayMs(response: Response | undefined, attempt: number, baseMs: number): number {
  const header = response?.headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
    }
  }
  return baseMs * 2 ** (attempt - 1);
}

async function postQuery(
  options: Required<Pick<FetchClosedIssuesOptions, 'token' | 'endpoint' | 'fetchImpl' | 'maxRetries' | 'retryBaseDelayMs' | 'sleep'>>,
  variables: { owner: string; name: string; after: string | null },
): Promise<GraphQLResponse> {
  let attempt = 0;

  for (;;) {
    let response: Response | undefined;
    let failure = '';

    try {
      response = await options.fetchImpl(options.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'github-changelog-generator',
        },
        body: JSON.stringify({ query: CLOSED_ISSUES_QUERY, variables }),
      });
    } catch (error) {
      failure = `network error: ${error instanceof Error ? error.message : String(error)}`;
    }

    if (response) {
      if (response.ok) {
        try {
          return (await response.json()) as GraphQLResponse;
        } catch {
          throw new GitHubApiError('GitHub returned a response that is not valid JSON', response.status);
        }
      }
      if (!isRetryable(response)) {
        throw new GitHubApiError(`GitHub API returned HTTP ${response.status}`, response.status);
      }
      failure = `HTTP ${response.status}`;
    }

    attempt += 1;
    if (attempt > options.maxRetries) {
      throw new GitHubApiError(
        `GitHub API request failed after ${attempt} attempts (${failure})`,
        response?.status,
      );
    }
    await options.sleep(retryDelayMs(response, attempt, options.retryBaseDelayMs));
  }
}

/**
 * Fetches every CLOSED issue of one repository using cursor pagination.
 * Throws rather than returning partial data.
 */
export async function fetchClosedIssues(
  options: FetchClosedIssuesOptions,
): Promise<FetchClosedIssuesResult> {
  const client = {
    token: options.token,
    endpoint: options.endpoint ?? DEFAULT_GRAPHQL_ENDPOINT,
    fetchImpl: options.fetchImpl ?? fetch,
    maxRetries: options.maxRetries ?? 3,
    retryBaseDelayMs: options.retryBaseDelayMs ?? 1000,
    sleep: options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))),
  };
  const maxPages = options.maxPages ?? 1000;

  const nodes: RawIssueNode[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let pagesFetched = 0;
  let repositoryUrl = '';
  let totalCount = 0;

  for (;;) {
    if (pagesFetched >= maxPages) {
      throw new GitHubApiError(`Stopped after ${maxPages} pages without reaching the last page`);
    }

    const body = await postQuery(client, { owner: options.owner, name: options.name, after: cursor });
    pagesFetched += 1;

    if (body.errors && body.errors.length > 0) {
      const messages = body.errors.map((e) => e.message).join('; ');
      throw new GitHubApiError(`GitHub GraphQL returned errors: ${messages}`);
    }

    const repository = body.data?.repository;
    if (!repository) {
      throw new GitHubApiError(
        `GitHub did not return repository ${options.owner}/${options.name}. Check the name and token access.`,
      );
    }

    const connection = repository.issues;
    repositoryUrl = repository.url;
    totalCount = connection.totalCount;
    for (const node of connection.nodes ?? []) {
      if (node) nodes.push(node);
    }

    if (!connection.pageInfo.hasNextPage) break;

    const next = connection.pageInfo.endCursor;
    if (!next) {
      throw new GitHubApiError('GitHub reported another page but gave no cursor');
    }
    if (seenCursors.has(next)) {
      throw new GitHubApiError(`Pagination loop detected: cursor ${next} was returned twice`);
    }
    seenCursors.add(next);
    cursor = next;
  }

  if (nodes.length < totalCount) {
    throw new GitHubApiError(
      `Incomplete result: collected ${nodes.length} issues but GitHub reports ${totalCount}`,
    );
  }

  return { repositoryUrl, nodes, pagesFetched, totalCount };
}