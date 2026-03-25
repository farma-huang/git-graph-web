import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// We'll test the runLoadFileDiff function directly once it's extracted.
// For now write tests that will fail until Task 3 implements the function.

import { runLoadFileDiff } from './loadFileDiff';

describe('runLoadFileDiff', () => {
	it('returns error for UNCOMMITTED hash', async () => {
		const result = await runLoadFileDiff({
			commitHash: '*',
			filePath: 'src/foo.ts',
			hasParents: true,
			parentIndex: 0,
			difftAvailable: false,
			repoPath: '/fake/repo'
		});
		expect(result.error).toBe('Cannot diff uncommitted changes');
		expect(result.diff).toBeNull();
	});

	it('returns git format when difft unavailable', async () => {
		// Mock Bun.spawn to return fake git diff output
		const spawnSpy = spyOn(Bun, 'spawn').mockImplementation((() => {
			let resolve: (v: any) => void;
			const exitedPromise = new Promise(r => { resolve = r; });
			const proc = {
				stdout: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('+new line\n')); c.close(); } }),
				stderr: new ReadableStream({ start(c) { c.close(); } }),
				exited: exitedPromise,
				exitCode: 0,
				kill: () => {}
			};
			resolve!(0);
			return proc;
		}) as any);

		const result = await runLoadFileDiff({
			commitHash: 'abc123',
			filePath: 'src/foo.ts',
			hasParents: true,
			parentIndex: 0,
			difftAvailable: false,
			repoPath: '/fake/repo'
		});

		expect(result.format).toBe('git');
		expect(result.error).toBeNull();
		spawnSpy.mockRestore();
	});

	it('uses /dev/null as old side when hasParents is false', async () => {
		const calls: string[][] = [];
		const spawnSpy = spyOn(Bun, 'spawn').mockImplementation(((args: string[]) => {
			calls.push(args);
			let resolve: (v: any) => void;
			const exitedPromise = new Promise(r => { resolve = r; });
			const proc = {
				stdout: new ReadableStream({ start(c) { c.close(); } }),
				stderr: new ReadableStream({ start(c) { c.close(); } }),
				exited: exitedPromise,
				exitCode: 0,
				kill: () => {}
			};
			resolve!(0);
			return proc;
		}) as any);

		await runLoadFileDiff({
			commitHash: 'abc123',
			filePath: 'src/foo.ts',
			hasParents: false,
			parentIndex: 0,
			difftAvailable: false,
			repoPath: '/fake/repo'
		});

		// git show should be called (not git diff with oldRef)
		const gitCalls = calls.filter(c => c[0] === 'git');
		expect(gitCalls[0][1]).toBe('show');
		spawnSpy.mockRestore();
	});

	it('uses parentIndex to build oldRef', async () => {
		const calls: string[][] = [];
		const spawnSpy = spyOn(Bun, 'spawn').mockImplementation(((args: string[]) => {
			calls.push(args);
			let resolve: (v: any) => void;
			const exitedPromise = new Promise(r => { resolve = r; });
			const proc = {
				stdout: new ReadableStream({ start(c) { c.close(); } }),
				stderr: new ReadableStream({ start(c) { c.close(); } }),
				exited: exitedPromise,
				exitCode: 0,
				kill: () => {}
			};
			resolve!(0);
			return proc;
		}) as any);

		await runLoadFileDiff({
			commitHash: 'abc123',
			filePath: 'src/foo.ts',
			hasParents: true,
			parentIndex: 1,
			difftAvailable: false,
			repoPath: '/fake/repo'
		});

		const gitDiffCall = calls.find(c => c[0] === 'git' && c[1] === 'diff');
		expect(gitDiffCall).toBeDefined();
		// oldRef should be abc123~1
		expect(gitDiffCall!.join(' ')).toContain('abc123~1');
		spawnSpy.mockRestore();
	});
});
