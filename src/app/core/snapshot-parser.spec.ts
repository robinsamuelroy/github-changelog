import { InvalidSnapshotError, parseSnapshot } from './snapshot-parser';

function validSnapshot(): any {
  return {
    schemaVersion: 1,
    generatedAt: '2026-11-20T12:00:00.000Z',
    repository: { owner: 'acme', name: 'widgets', url: 'https://github.com/acme/widgets' },
    angularVersion: '22.3.0',
    stats: { total: 1, completed: 1, notPlanned: 0, unknown: 0 },
    issues: [
      {
        id: 'I_1',
        number: 1,
        title: 'First',
        url: 'https://github.com/acme/widgets/issues/1',
        author: { login: 'octocat', avatarUrl: null },
        labels: [{ name: 'bug', color: 'd73a4a' }],
        closedAt: '2026-03-15T10:00:00.000Z',
        closureReason: 'COMPLETED',
        rawClosureReason: 'COMPLETED',
      },
    ],
  };
}

describe('parseSnapshot', () => {
  it('accepts a valid snapshot', () => {
    expect(parseSnapshot(validSnapshot()).issues).toHaveLength(1);
  });

  it('accepts an empty repository', () => {
    const value = validSnapshot();
    value.issues = [];
    value.stats = { total: 0, completed: 0, notPlanned: 0, unknown: 0 };
    expect(parseSnapshot(value).issues).toEqual([]);
  });

  it('accepts an issue with a null author', () => {
    const value = validSnapshot();
    value.issues[0].author = null;
    expect(() => parseSnapshot(value)).not.toThrow();
  });

  it.each([null, 'text', 42, []])('rejects %j', (input) => {
    expect(() => parseSnapshot(input)).toThrow(InvalidSnapshotError);
  });

  it('rejects an unsupported schemaVersion', () => {
    const value = validSnapshot();
    value.schemaVersion = 2;
    expect(() => parseSnapshot(value)).toThrow(/schemaVersion/);
  });

  it('rejects a missing repository', () => {
    const value = validSnapshot();
    delete value.repository;
    expect(() => parseSnapshot(value)).toThrow(/repository/);
  });

  it('rejects a bad closure reason', () => {
    const value = validSnapshot();
    value.issues[0].closureReason = 'DONE';
    expect(() => parseSnapshot(value)).toThrow(/closureReason/);
  });

  it('rejects a non-http issue URL', () => {
    const value = validSnapshot();
    value.issues[0].url = 'javascript:alert(1)';
    expect(() => parseSnapshot(value)).toThrow(/url/);
  });

  it('reports every problem it finds', () => {
    const value = validSnapshot();
    value.angularVersion = '';
    value.stats.total = 'many';
    try {
      parseSnapshot(value);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as InvalidSnapshotError).problems).toHaveLength(2);
    }
  });
});