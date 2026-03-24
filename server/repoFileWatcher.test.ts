import { describe, test, expect } from 'bun:test';
import { RepoFileWatcher } from './repoFileWatcher';
import { writeFileSync } from 'fs';
import { join } from 'path';

describe('RepoFileWatcher', () => {
  test('calls onChange when .git/HEAD changes', async () => {
    const repoPath = process.cwd();
    let called = false;
    const watcher = new RepoFileWatcher(new (require('./logger').Logger)(), () => { called = true; });

    watcher.start(repoPath);
    // Touch HEAD to trigger watcher
    const headPath = join(repoPath, '.git', 'HEAD');
    const originalContent = require('fs').readFileSync(headPath, 'utf8');
    writeFileSync(headPath, originalContent); // write same content to trigger change

    await new Promise(resolve => setTimeout(resolve, 1000)); // wait for debounce
    watcher.stop();

    expect(called).toBe(true);
  });
});
