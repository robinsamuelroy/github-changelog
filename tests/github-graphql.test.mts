import { describe, expect, it, vi } from 'vitest';
import { fetchClosedIssues, GitHubApiError } from '../scripts/github-graphql.mts';
import type { RawIssueNode } from '../scripts/normalize-issues.mts';

const TOKEN = 'test-token-value';

function nodeFor(i: number): RawIssueNode {
  return {
    id: `I_${i}`,
    number: i,
    title: `Issue ${i}`,
    url: `https://github.com/acme/widgets/issues/${i}`,
    closedAt: '2026-03-15T10:00:00Z',
    stateReason: 'COMPLETED',
    author: { login: 'octocat', avatarUrl: null },
    labels: { nodes: [] },
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function pageBody(args: {
  total: number;
  hasNext: boolean;
  cursor: string | null;
  nodes: Array<RawIssueNode | null>;
}) {
  return {
    data: {
      repository: {
        url: 'https://github.com/acme/widgets',
        issues: {
          totalCount: args.total,
          pageInfo: { hasNextPage: args.hasNext, endCursor: args.cursor },
          nodes: args.nodes,
        },
      },
    },
  };
}

/** A fake GitHub that serves `total` issues, `pageSize` at a time, using string-index cursors. */
function pagedServer(total: number, pageSize = 100) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const sent = JSON.parse(String(init?.body)) as { variables: { after: string | null } };
    const start = sent.variables.after === null ? 0 : Number(sent.variables.after);
    const end = Math.min(start + pageSize, total);
    const nodes = Array.from({ length: end - start }, (_, k) => nodeFor(start + k + 1));
    return jsonResponse(
      pageBody({ total, hasNext: end < total, cursor: String(end), nodes }),
    );
  });
}

/** Returns the given responses (or throws the given errors) in order. */
function sequence(items: Array<() => Response | Error>) {
  let index = 0;
  return vi.fn(async () => {
    const item = items[index++];
    if (!item) throw new Error('Unexpected extra request');
    const result = item();
    if (result instanceof Error) throw result;
    return result;
  });
}

const asFetch = (fn: unknown) => fn as typeof fetch;
const noSleep = async () => {};

function baseOptions(fetchImpl: unknown) {
  return {
    token: TOKEN,
    owner: 'acme',
    name: 'widgets',
    fetchImpl: asFetch(fetchImpl),
    sleep: noSleep,
  };
}

describe('fetchClosedIssues pagination', () => {
  it.each([
    [0, 1],
    [1, 1],
    [100, 1],
    [101, 2],
    [250, 3],
    [300, 3],
  ])('retrieves all %i issues in %i page(s)', async (total, pages) => {
    const server = pagedServer(total);
    const result = await fetchClosedIssues(baseOptions(server));
    expect(result.nodes).toHaveLength(total);
    expect(result.pagesFetched).toBe(pages);
    expect(server).toHaveBeenCalledTimes(pages);
    expect(result.repositoryUrl).toBe('https://github.com/acme/widgets');
  });

  it('passes the previous endCursor to the next request', async () => {
    const server = pagedServer(150);
    await fetchClosedIssues(baseOptions(server));
    const second = JSON.parse(String(server.mock.calls[1]?.[1]?.body)) as {
      variables: { after: string };
    };
    expect(second.variables.after).toBe('100');
  });

  it('throws when hasNextPage is true but there is no cursor', async () => {
    const server = sequence([
      () => jsonResponse(pageBody({ total: 5, hasNext: true, cursor: null, nodes: [nodeFor(1)] })),
    ]);
    await expect(fetchClosedIssues(baseOptions(server))).rejects.toThrow(/no cursor/);
  });

  it('throws when a cursor repeats', async () => {
    const server = vi.fn(async () =>
      jsonResponse(pageBody({ total: 1000, hasNext: true, cursor: 'same', nodes: [nodeFor(1)] })),
    );
    await expect(fetchClosedIssues(baseOptions(server))).rejects.toThrow(/Pagination loop/);
  });

  it('stops at maxPages even if GitHub keeps returning new cursors', async () => {
    let n = 0;
    const server = vi.fn(async () => {
      n += 1;
      return jsonResponse(
        pageBody({ total: 1000, hasNext: true, cursor: `c${n}`, nodes: [nodeFor(n)] }),
      );
    });
    await expect(
      fetchClosedIssues({ ...baseOptions(server), maxPages: 3 }),
    ).rejects.toThrow(/Stopped after 3 pages/);
    expect(server).toHaveBeenCalledTimes(3);
  });

  it('throws when fewer issues arrive than totalCount', async () => {
    const server = sequence([
      () => jsonResponse(pageBody({ total: 5, hasNext: false, cursor: null, nodes: [nodeFor(1), nodeFor(2)] })),
    ]);
    await expect(fetchClosedIssues(baseOptions(server))).rejects.toThrow(/Incomplete result/);
  });
});

describe('fetchClosedIssues request', () => {
  it('sends owner, name and the token only in the Authorization header', async () => {
    const server = pagedServer(1);
    await fetchClosedIssues(baseOptions(server));
    const init = server.mock.calls[0]?.[1];
    const headers = init?.headers as Record<string, string>;
    const body = String(init?.body);
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
    expect(body).not.toContain(TOKEN);
    const parsed = JSON.parse(body) as { query: string; variables: Record<string, unknown> };
    expect(parsed.variables).toEqual({ owner: 'acme', name: 'widgets', after: null });
    expect(parsed.query).toContain('states: CLOSED');
    expect(parsed.query).toContain('stateReason');
  });
});

describe('fetchClosedIssues errors and retries', () => {
  it('fails immediately on HTTP 401 without retrying', async () => {
    const sleep = vi.fn(noSleep);
    const server = sequence([() => new Response('nope', { status: 401 })]);
    const promise = fetchClosedIssues({ ...baseOptions(server), sleep });
    await expect(promise).rejects.toBeInstanceOf(GitHubApiError);
    await expect(promise).rejects.toMatchObject({ status: 401 });
    expect(server).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries a 502 and then succeeds', async () => {
    const delays: number[] = [];
    const server = sequence([
      () => new Response('bad gateway', { status: 502 }),
      () => jsonResponse(pageBody({ total: 1, hasNext: false, cursor: null, nodes: [nodeFor(1)] })),
    ]);
    const result = await fetchClosedIssues({
      ...baseOptions(server),
      retryBaseDelayMs: 1000,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    expect(result.nodes).toHaveLength(1);
    expect(delays).toEqual([1000]);
  });

  it('retries after a network error and then succeeds', async () => {
    const server = sequence([
      () => new Error('socket hang up'),
      () => jsonResponse(pageBody({ total: 0, hasNext: false, cursor: null, nodes: [] })),
    ]);
    const result = await fetchClosedIssues(baseOptions(server));
    expect(result.nodes).toEqual([]);
    expect(server).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxRetries and reports the attempts', async () => {
    const server = vi.fn(async () => new Response('bad gateway', { status: 502 }));
    await expect(
      fetchClosedIssues({ ...baseOptions(server), maxRetries: 2 }),
    ).rejects.toThrow(/after 3 attempts/);
    expect(server).toHaveBeenCalledTimes(3);
  });

  it('honors Retry-After on a 429', async () => {
    const delays: number[] = [];
    const server = sequence([
      () => new Response('slow down', { status: 429, headers: { 'retry-after': '2' } }),
      () => jsonResponse(pageBody({ total: 0, hasNext: false, cursor: null, nodes: [] })),
    ]);
    await fetchClosedIssues({
      ...baseOptions(server),
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    expect(delays).toEqual([2000]);
  });

  it('throws on GraphQL errors, even with HTTP 200, and does not retry', async () => {
    const server = sequence([
      () => jsonResponse({ errors: [{ message: "Field 'stateReason' doesn't exist" }] }),
    ]);
    await expect(fetchClosedIssues(baseOptions(server))).rejects.toThrow(/stateReason/);
    expect(server).toHaveBeenCalledTimes(1);
  });

  it('throws when the repository is not returned', async () => {
    const server = sequence([() => jsonResponse({ data: { repository: null } })]);
    await expect(fetchClosedIssues(baseOptions(server))).rejects.toThrow(/acme\/widgets/);
  });

  it('throws when the response is not valid JSON', async () => {
    const server = sequence([() => new Response('<html>', { status: 200 })]);
    await expect(fetchClosedIssues(baseOptions(server))).rejects.toThrow(/not valid JSON/);
  });
});