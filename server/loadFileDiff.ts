import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync, unlinkSync, existsSync } from 'fs';

export const UNCOMMITTED = '*';

interface RunLoadFileDiffOptions {
	fromHash: string;
	toHash: string;
	oldFilePath: string;
	newFilePath: string;
	hasParents: boolean;
	difftAvailable: boolean;
	repoPath: string;
	isDeleted?: boolean;
}

interface LoadFileDiffResult {
	diff: string | null;
	format: 'difftastic' | 'git';
	error: string | null;
}

async function spawnAndRead(args: string[], cwd: string, timeoutMs = 30000): Promise<{ stdout: string; exitCode: number }> {
	const proc = Bun.spawn(args, {
		cwd,
		stdout: 'pipe',
		stderr: 'pipe'
	});

	const timeout = setTimeout(() => proc.kill(), timeoutMs);

	try {
		const [stdoutBuf] = await Promise.all([
			new Response(proc.stdout).text(),
			proc.exited
		]);
		clearTimeout(timeout);
		return { stdout: stdoutBuf, exitCode: proc.exitCode ?? 1 };
	} catch (e) {
		clearTimeout(timeout);
		throw e;
	}
}

export async function runLoadFileDiff(opts: RunLoadFileDiffOptions): Promise<LoadFileDiffResult> {
	const { fromHash, toHash, oldFilePath, newFilePath, hasParents, difftAvailable, repoPath, isDeleted } = opts;

	if (toHash === UNCOMMITTED) {
		return { diff: null, format: 'git', error: 'Cannot diff uncommitted changes' };
	}

	const oldPath = oldFilePath;
	const newPath = newFilePath;
	let oldRef: string | null = fromHash;
	if (fromHash === toHash) {
		oldRef = hasParents ? `${toHash}^1` : null;
	}

	if (difftAvailable) {
		const uuid = crypto.randomUUID();
		const newTmpFile = join(tmpdir(), `gitgraphweb-${uuid}-new`);
		let oldTmpFile: string | null = null;
		let oldSideArg: string;

		try {
			// Extract new file content
			if (!isDeleted) {
				const newResult = await spawnAndRead(['git', 'show', `${toHash}:${newPath}`], repoPath);
				if (newResult.exitCode !== 0) {
					throw new Error(`git show new file failed (exit ${newResult.exitCode})`);
				}
				writeFileSync(newTmpFile, newResult.stdout);
			} else {
				// deleted file, new file is /dev/null
			}

			if (oldRef !== null) {
				oldTmpFile = join(tmpdir(), `gitgraphweb-${uuid}-old`);
				const oldResult = await spawnAndRead(['git', 'show', `${oldRef}:${oldPath}`], repoPath);
				if (oldResult.exitCode !== 0) {
					throw new Error(`git show old file failed (exit ${oldResult.exitCode})`);
				}
				writeFileSync(oldTmpFile, oldResult.stdout);
				oldSideArg = oldTmpFile;
			} else {
				oldSideArg = '/dev/null';
			}

			const newSideArg = isDeleted ? '/dev/null' : newTmpFile;
			const difftResult = await spawnAndRead(['difft', '--color', 'always', oldSideArg, newSideArg], repoPath);
			return { diff: difftResult.stdout, format: 'difftastic', error: null };
		} catch (e: any) {
			return { diff: null, format: 'difftastic', error: e.message ?? String(e) };
		} finally {
			try { if (!isDeleted && existsSync(newTmpFile)) unlinkSync(newTmpFile); } catch { }
			try { if (oldTmpFile && existsSync(oldTmpFile)) unlinkSync(oldTmpFile); } catch { }
		}
	} else {
		// Fallback: git diff
		try {
			let result: { stdout: string; exitCode: number };
			if (oldRef === null) {
				// New file / first commit: show the whole file as added
				result = await spawnAndRead(['git', 'show', '--color=always', `${toHash}`, '--', newPath], repoPath);
			} else if (isDeleted) {
				// git diff on deletion
				result = await spawnAndRead(['git', 'diff', '--color=always', `${oldRef}:${oldPath}`, '/dev/null'], repoPath);
			} else {
				// Diff two specific blobs: git diff <oldRef>:<oldPath> <commitHash>:<newPath>
				result = await spawnAndRead(['git', 'diff', '--color=always', `${oldRef}:${oldPath}`, `${toHash}:${newPath}`], repoPath);
			}
			return { diff: result.stdout, format: 'git', error: null };
		} catch (e: any) {
			return { diff: null, format: 'git', error: e.message ?? String(e) };
		}
	}
}

export async function checkDifftAvailable(): Promise<boolean> {
	try {
		const proc = Bun.spawn(['difft', '--version'], { stdout: 'pipe', stderr: 'pipe' });
		await proc.exited;
		return proc.exitCode === 0;
	} catch {
		return false;
	}
}
