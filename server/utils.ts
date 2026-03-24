import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getConfig } from './config';

export const UNCOMMITTED = '*';
export const UNABLE_TO_FIND_GIT_MSG = 'Unable to find a Git executable.';

/* Path Manipulation */

const FS_REGEX = /\\/g;

export function getPathFromUri(uri: any) {
	return uri.fsPath ? uri.fsPath.replace(FS_REGEX, '/') : String(uri).replace(FS_REGEX, '/');
}

export function getPathFromStr(str: string) {
	return str.replace(FS_REGEX, '/');
}

export function pathWithTrailingSlash(path: string) {
	return path.endsWith('/') ? path : path + '/';
}

export function realpath(path: string, native: boolean = false) {
	return new Promise<string>((resolve) => {
		(native ? fs.realpath.native : fs.realpath)(path, (err, resolvedPath) => resolve(err !== null ? path : getPathFromStr(resolvedPath)));
	});
}

export function doesFileExist(path: string) {
	return new Promise<boolean>((resolve) => {
		fs.access(path, fs.constants.R_OK, (err) => resolve(err === null));
	});
}


/* General Methods */

export function abbrevCommit(commitHash: string) {
	return commitHash.substring(0, 8);
}


/* Visual Studio Code API Wrappers (Mocked for Server) */

export function showErrorMessage(message: string) {
	console.error('Error:', message);
}

export function openGitTerminal(cwd: string, gitPath: string, command: string | null, name: string) {
	console.log(`[Git Terminal - ${name}] Command: git ${command}`);
}


/* Promise Methods */

export function resolveSpawnOutput(cmd: cp.ChildProcess) {
	return Promise.all([
		new Promise<{ code: number, error: Error | null }>((resolve) => {
			let resolved = false;
			cmd.on('error', (error) => {
				if (resolved) return;
				resolve({ code: -1, error: error });
				resolved = true;
			});
			cmd.on('exit', (code) => {
				if (resolved) return;
				resolve({ code: code ?? -1, error: null });
				resolved = true;
			});
		}),
		new Promise<Buffer>((resolve) => {
			let buffers: Buffer[] = [];
			cmd.stdout?.on('data', (b: Buffer) => { buffers.push(b); });
			cmd.stdout?.on('close', () => resolve(Buffer.concat(buffers)));
		}),
		new Promise<string>((resolve) => {
			let stderr = '';
			cmd.stderr?.on('data', (d) => { stderr += d; });
			cmd.stderr?.on('close', () => resolve(stderr));
		})
	]);
}


/* Find Git Executable */

export interface GitExecutable {
	readonly path: string;
	readonly version: string;
}

export async function findGit(): Promise<GitExecutable> {
	const configGitPaths = getConfig().gitPaths;
	if (configGitPaths.length > 0) {
		try {
			return await getGitExecutableFromPaths(configGitPaths);
		} catch (_) { }
	}

	switch (process.platform) {
		case 'darwin':
			return findGitOnDarwin();
		case 'win32':
			return findGitOnWin32();
		default:
			return getGitExecutable('git');
	}
}

function findGitOnDarwin() {
	return new Promise<GitExecutable>((resolve, reject) => {
		cp.exec('which git', (err, stdout) => {
			if (err) return reject();

			const gitPath = stdout.trim();
			if (gitPath !== '/usr/bin/git') {
				getGitExecutable(gitPath).then((exec) => resolve(exec), () => reject());
			} else {
				cp.exec('xcode-select -p', (err: any) => {
					if (err && err.code === 2) {
						reject();
					} else {
						getGitExecutable(gitPath).then((exec) => resolve(exec), () => reject());
					}
				});
			}
		});
	});
}

function findGitOnWin32() {
	return findSystemGitWin32(process.env['ProgramW6432'])
		.then(undefined, () => findSystemGitWin32(process.env['ProgramFiles(x86)']))
		.then(undefined, () => findSystemGitWin32(process.env['ProgramFiles']))
		.then(undefined, () => findSystemGitWin32(process.env['LocalAppData'] ? path.join(process.env['LocalAppData']!, 'Programs') : undefined))
		.then(undefined, () => findGitWin32InPath());
}

function findSystemGitWin32(pathBase?: string) {
	return pathBase
		? getGitExecutable(path.join(pathBase, 'Git', 'cmd', 'git.exe'))
		: Promise.reject<GitExecutable>();
}

async function findGitWin32InPath() {
	let dirs = (process.env['PATH'] || '').split(';');
	dirs.unshift(process.cwd());

	for (let i = 0; i < dirs.length; i++) {
		let file = path.join(dirs[i], 'git.exe');
		if (await isExecutable(file)) {
			try {
				return await getGitExecutable(file);
			} catch (_) { }
		}
	}
	return Promise.reject<GitExecutable>();
}

function isExecutable(path: string) {
	return new Promise<boolean>(resolve => {
		fs.stat(path, (err, stat) => {
			resolve(!err && (stat.isFile() || stat.isSymbolicLink()));
		});
	});
}

export function getGitExecutable(executablePath: string) {
	return new Promise<GitExecutable>((resolve, reject) => {
		resolveSpawnOutput(cp.spawn(executablePath, ['--version'])).then((values: any) => {
			if (values[0].code === 0) {
				resolve({ path: executablePath, version: values[1].toString().trim().replace(/^git version /, '') });
			} else {
				reject();
			}
		});
	});
}

export async function getGitExecutableFromPaths(paths: string[]): Promise<GitExecutable> {
	for (let i = 0; i < paths.length; i++) {
		try {
			return await getGitExecutable(paths[i]);
		} catch (_) { }
	}
	throw new Error('None of the provided paths are a Git executable');
}


/* Version Handling / Requirements */

export const enum GitVersionRequirement {
	FetchAndPruneTags = '2.17.0',
	GpgInfo = '2.4.0',
	PushStash = '2.13.2',
	TagDetails = '1.7.8'
}

export function doesVersionMeetRequirement(version: string, requiredVersion: GitVersionRequirement | string) {
	const v1 = parseVersion(version);
	const v2 = parseVersion(requiredVersion);

	if (v1 === null || v2 === null) {
		return true;
	}

	if (v1.major > v2.major) return true;
	if (v1.major < v2.major) return false;

	if (v1.minor > v2.minor) return true;
	if (v1.minor < v2.minor) return false;

	if (v1.patch > v2.patch) return true;
	if (v1.patch < v2.patch) return false;

	return true;
}

function parseVersion(version: string) {
	const match = version.trim().match(/^[0-9]+(\.[0-9]+|)(\.[0-9]+|)/);
	if (match === null) {
		return null;
	}

	const comps = match[0].split('.');
	return {
		major: parseInt(comps[0], 10),
		minor: comps.length > 1 ? parseInt(comps[1], 10) : 0,
		patch: comps.length > 2 ? parseInt(comps[2], 10) : 0
	};
}

export function constructIncompatibleGitVersionMessage(executable: GitExecutable, version: GitVersionRequirement, feature?: string) {
	return 'A newer version of Git (>= ' + version + ') is required for ' + (feature ? feature : 'this feature') + '. Git ' + executable.version + ' is currently installed. Please install a newer version of Git to use this feature.';
}