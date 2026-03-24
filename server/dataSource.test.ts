import { describe, test, expect } from 'bun:test';
import { DataSource } from './dataSource';
import { Logger } from './logger';
import { Event } from './utils/event';
import { findGit } from './utils';

describe('DataSource', () => {
  test('instantiates and gets repo info', async () => {
    const logger = new Logger();
    const mockEvent: Event<any> = (listener) => ({ dispose: () => {} });
    const executable = await findGit();
    const dataSource = new DataSource(executable, mockEvent, mockEvent, logger);

    // This directory itself is a git repo, so we can test against it
    const info = await dataSource.getRepoInfo('.', false, false, []);
    expect(info.error).toBeNull();
    expect(Array.isArray(info.branches)).toBe(true);
  });
});
