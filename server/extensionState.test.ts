import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ExtensionState } from './extensionState';
import { rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const TEST_DB = join(homedir(), '.git-graph-web-test', 'state.db');

describe('ExtensionState', () => {
  let state: ExtensionState;

  beforeEach(() => {
    // Use a test-specific DB path by setting env
    process.env.GIT_GRAPH_WEB_DATA_DIR = join(homedir(), '.git-graph-web-test');
    state = new ExtensionState();
  });

  afterEach(() => {
    rmSync(join(homedir(), '.git-graph-web-test'), { recursive: true, force: true });
    delete process.env.GIT_GRAPH_WEB_DATA_DIR;
  });

  test('returns default repo state for unknown repo', () => {
    const result = state.getRepoState('/some/repo');
    expect(result.showRemoteBranches).toBe(true);
  });

  test('persists repo state across calls', () => {
    state.setRepoState('/some/repo', { ...state.getRepoState('/some/repo'), showRemoteBranches: false });
    expect(state.getRepoState('/some/repo').showRemoteBranches).toBe(false);
  });

  test('saves and retrieves avatars', () => {
    const img = Buffer.from('fake-image-data');
    state.saveAvatar('test@example.com', img);
    const retrieved = state.getAvatar('test@example.com');
    expect(retrieved ? Buffer.from(retrieved).toString() : null).toBe('fake-image-data');
  });

  test('saves and retrieves code reviews', () => {
    const data = { lastActive: Date.now(), lastViewedFile: 'src/foo.ts', remainingFiles: ['src/bar.ts'] };
    state.saveCodeReview('/my/repo', 'review-1', data);
    const reviews = state.getCodeReviews('/my/repo');
    expect(reviews['review-1'].lastViewedFile).toBe('src/foo.ts');
    expect(reviews['review-1'].remainingFiles).toEqual(['src/bar.ts']);
  });

  test('endCodeReview removes the review', () => {
    const data = { lastActive: Date.now(), lastViewedFile: null, remainingFiles: ['f.ts'] };
    state.saveCodeReview('/my/repo', 'review-2', data);
    state.endCodeReview('/my/repo', 'review-2');
    const reviews = state.getCodeReviews('/my/repo');
    expect(reviews['review-2']).toBeUndefined();
  });
});
