import { closureLabel, formatClosed, labelColor } from './issue-display';

describe('closureLabel', () => {
  it('names completed and not planned issues', () => {
    expect(closureLabel({ closureReason: 'COMPLETED', rawClosureReason: 'COMPLETED' })).toBe('Completed');
    expect(closureLabel({ closureReason: 'NOT_PLANNED', rawClosureReason: 'NOT_PLANNED' })).toBe('Not planned');
  });

  it('never presents a missing reason as completed', () => {
    expect(closureLabel({ closureReason: 'UNKNOWN', rawClosureReason: null })).toBe('Reason unavailable');
  });

  it('names duplicates', () => {
    expect(closureLabel({ closureReason: 'UNKNOWN', rawClosureReason: 'DUPLICATE' })).toBe('Duplicate');
  });

  it('describes a future reason without hiding it', () => {
    expect(closureLabel({ closureReason: 'UNKNOWN', rawClosureReason: 'SOMETHING_NEW' })).toBe(
      'Other (something new)',
    );
  });
});

describe('labelColor', () => {
  it('prefixes a valid hex color', () => {
    expect(labelColor('d73a4a')).toBe('#d73a4a');
    expect(labelColor('ABCDEF')).toBe('#ABCDEF');
  });

  it.each(['', 'red', 'fff', 'zzzzzz', 'red; background:url(x)', '#d73a4a'])(
    'falls back for %j',
    (value) => {
      expect(labelColor(value)).toBe('var(--muted)');
    },
  );
});

describe('formatClosed', () => {
  it('formats in UTC', () => {
    expect(formatClosed('2026-03-15T10:00:00.000Z')).toMatch(/^Mar 15, 2026, 10:00\sAM UTC$/);
  });

  it('does not shift the date for the viewer timezone', () => {
    expect(formatClosed('2026-03-31T23:30:00.000Z')).toMatch(/^Mar 31, 2026, 11:30\sPM UTC$/);
  });
});