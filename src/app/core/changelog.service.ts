import { Injectable, signal } from '@angular/core';
import { InvalidSnapshotError, parseSnapshot } from './snapshot-parser';
import type { Snapshot } from './snapshot.model';

export type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; snapshot: Snapshot }
  | { status: 'error'; message: string };

/**
 * Relative on purpose: it resolves against the page's base URL,
 * so it works under any GitHub Pages project path.
 */
export const SNAPSHOT_URL = 'changelog.json';

function describeError(error: unknown): string {
  if (error instanceof InvalidSnapshotError) {
    const shown = error.problems.slice(0, 3).join('; ');
    return `The changelog file has an unexpected format (${shown}).`;
  }
  if (error instanceof TypeError) {
    return 'Could not reach the changelog file. Check your connection and try again.';
  }
  if (error instanceof Error) return error.message;
  return 'The changelog could not be loaded.';
}

@Injectable({ providedIn: 'root' })
export class ChangelogService {
  private readonly stateSignal = signal<LoadState>({ status: 'loading' });
  readonly state = this.stateSignal.asReadonly();

  async load(): Promise<void> {
    this.stateSignal.set({ status: 'loading' });
    try {
      // 'no-cache' makes the browser revalidate, so a reload sees the latest deployment.
      const response = await fetch(SNAPSHOT_URL, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`The changelog file could not be loaded (HTTP ${response.status}).`);
      }

      let json: unknown;
      try {
        json = await response.json();
      } catch {
        throw new Error('The changelog file is not valid JSON.');
      }

      this.stateSignal.set({ status: 'ready', snapshot: parseSnapshot(json) });
    } catch (error) {
      this.stateSignal.set({ status: 'error', message: describeError(error) });
    }
  }
}