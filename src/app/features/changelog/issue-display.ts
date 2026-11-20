import type { SnapshotIssue } from '../../core/snapshot.model';

/** Human-readable closure reason. UNKNOWN is never presented as completed. */
export function closureLabel(
  issue: Pick<SnapshotIssue, 'closureReason' | 'rawClosureReason'>,
): string {
  switch (issue.closureReason) {
    case 'COMPLETED':
      return 'Completed';
    case 'NOT_PLANNED':
      return 'Not planned';
    default: {
      const raw = issue.rawClosureReason;
      if (raw === null) return 'Reason unavailable';
      if (raw === 'DUPLICATE') return 'Duplicate';
      return `Other (${raw.toLowerCase().replace(/_/g, ' ')})`;
    }
  }
}

const HEX_COLOR = /^[0-9a-f]{6}$/i;

/** Label colors come from the snapshot, so only a plain 6-digit hex value is accepted. */
export function labelColor(color: string): string {
  return HEX_COLOR.test(color) ? `#${color}` : 'var(--muted)';
}

const closedFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

/** Closure time, always shown in UTC to match the month grouping. */
export function formatClosed(closedAt: string): string {
  return `${closedFormatter.format(new Date(closedAt))} UTC`;
}