# Inline File Diff Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an expand icon to each file row in the commit details panel that shows an inline difftastic-powered (or git diff fallback) diff when clicked.

**Architecture:** New `loadFileDiff` WebSocket message — frontend sends request with commitHash + filePath, server runs `difft` or `git diff`, returns ANSI output; frontend converts ANSI to HTML via a new `ansiToHtml.ts` utility and renders it inline below the file row with a local diff cache.

**Tech Stack:** Bun (server), TypeScript, WebSocket, difftastic (`difft` CLI), `crypto.randomUUID()`, `os.tmpdir()`

---

## Chunk 1: Types + Server Handler

### Task 1: Add types to `server/types.ts`

**Files:**
- Modify: `server/types.ts` (lines 1251–1313 for union types, add new interfaces before them)

- [ ] **Step 1: Add `RequestLoadFileDiff` interface**

In `server/types.ts`, before the `RequestMessage` union type, add:

```typescript
export interface RequestLoadFileDiff extends BaseMessage {
	readonly command: 'loadFileDiff';
	readonly commitHash: string;
	readonly filePath: string;
	readonly oldFilePath?: string;
	readonly hasParents: boolean;
	readonly parentIndex: number;
}
```

- [ ] **Step 2: Add `ResponseLoadFileDiff` interface**

Immediately after `RequestLoadFileDiff`, add:

```typescript
export interface ResponseLoadFileDiff extends BaseMessage {
	readonly command: 'loadFileDiff';
	readonly commitHash: string;
	readonly filePath: string;
	readonly diff: string | null;
	readonly format: 'difftastic' | 'git';
	readonly error: string | null;
}
```

- [ ] **Step 3: Add to `RequestMessage` union**

In the `RequestMessage` union type (around line 1313), add `| RequestLoadFileDiff` before the semicolon.

- [ ] **Step 4: Add to `ResponseMessage` union**

In the `ResponseMessage` union type, add `| ResponseLoadFileDiff` before the semicolon.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/farmahuang/git-graph-web && bunx tsc --project server/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server/types.ts
git commit -m "feat: add RequestLoadFileDiff and ResponseLoadFileDiff types"
```

---

### Task 2: Write server handler tests

**Files:**
- Create: `server/loadFileDiff.test.ts`

**Context:** The project uses `bun test`. Look at `server/repoFileWatcher.test.ts` for the test file pattern.

- [ ] **Step 1: Write the test file**

Create `server/loadFileDiff.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests — expect failure (function not yet exported)**

```bash
cd /Users/farmahuang/git-graph-web && bun test server/loadFileDiff.test.ts
```

Expected: error like `Cannot find module './loadFileDiff'` or import error.

---

### Task 3: Implement `server/loadFileDiff.ts`

**Files:**
- Create: `server/loadFileDiff.ts`

- [ ] **Step 1: Write the implementation**

Create `server/loadFileDiff.ts`:

```typescript
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync, unlinkSync, existsSync } from 'fs';

export const UNCOMMITTED = '*';

interface RunLoadFileDiffOptions {
	commitHash: string;
	filePath: string;
	oldFilePath?: string;
	hasParents: boolean;
	parentIndex: number;
	difftAvailable: boolean;
	repoPath: string;
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
	const { commitHash, filePath, oldFilePath, hasParents, parentIndex, difftAvailable, repoPath } = opts;

	if (commitHash === UNCOMMITTED) {
		return { diff: null, format: 'git', error: 'Cannot diff uncommitted changes' };
	}

	const oldPath = oldFilePath ?? filePath;
	const newPath = filePath;
	const oldRef = hasParents ? `${commitHash}~${parentIndex}` : null;

	if (difftAvailable) {
		const uuid = crypto.randomUUID();
		const newTmpFile = join(tmpdir(), `gitgraphweb-${uuid}-new`);
		let oldTmpFile: string | null = null;
		let oldSideArg: string;

		try {
			// Extract new file content
			const newResult = await spawnAndRead(['git', 'show', `${commitHash}:${newPath}`], repoPath);
			if (newResult.exitCode !== 0) {
				throw new Error(`git show new file failed (exit ${newResult.exitCode})`);
			}
			writeFileSync(newTmpFile, newResult.stdout);

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

			const difftResult = await spawnAndRead(['difft', '--color', 'always', oldSideArg, newTmpFile], repoPath);
			return { diff: difftResult.stdout, format: 'difftastic', error: null };
		} catch (e: any) {
			return { diff: null, format: 'difftastic', error: e.message ?? String(e) };
		} finally {
			try { if (existsSync(newTmpFile)) unlinkSync(newTmpFile); } catch { }
			try { if (oldTmpFile && existsSync(oldTmpFile)) unlinkSync(oldTmpFile); } catch { }
		}
	} else {
		// Fallback: git diff
		try {
			let result: { stdout: string; exitCode: number };
			if (oldRef === null) {
				// New file / first commit: show the whole file as added
				result = await spawnAndRead(['git', 'show', '--color=always', `${commitHash}`, '--', newPath], repoPath);
			} else {
				// Diff two specific blobs: git diff <oldRef>:<oldPath> <commitHash>:<newPath>
				result = await spawnAndRead(['git', 'diff', '--color=always', `${oldRef}:${oldPath}`, `${commitHash}:${newPath}`], repoPath);
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
```

- [ ] **Step 2: Run the tests**

```bash
cd /Users/farmahuang/git-graph-web && bun test server/loadFileDiff.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/loadFileDiff.ts server/loadFileDiff.test.ts
git commit -m "feat: implement runLoadFileDiff with difft/git-diff fallback"
```

---

### Task 4: Wire handler into `server/routes.ts` + `server/index.ts`

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Update `MessageRouter` constructor to accept `difftAvailable`**

In `server/routes.ts`, change the constructor:

```typescript
constructor(
    private readonly dataSource: DataSource,
    private readonly extensionState: ExtensionState,
    private readonly repoManager: RepoManager,
    private readonly avatarManager: AvatarManager,
    private readonly repoPath: string,
    private readonly difftAvailable: boolean   // add this
) {}
```

- [ ] **Step 2: Add the `loadFileDiff` case in `handleMessage`**

In `server/routes.ts`, add an import at the top:

```typescript
import { runLoadFileDiff } from './loadFileDiff';
```

Then in the `switch` statement, add before the closing `}`:

```typescript
case 'loadFileDiff': {
    const result = await runLoadFileDiff({
        commitHash: msg.commitHash,
        filePath: msg.filePath,
        oldFilePath: msg.oldFilePath,
        hasParents: msg.hasParents,
        parentIndex: msg.parentIndex,
        difftAvailable: this.difftAvailable,
        repoPath: this.repoPath
    });
    this.send(ws, msg, {
        command: 'loadFileDiff',
        commitHash: msg.commitHash,
        filePath: msg.filePath,
        diff: result.diff,
        format: result.format,
        error: result.error
    } as any);
    break;
}
```

- [ ] **Step 3: Cache `difftAvailable` at startup in `server/index.ts`**

In `server/index.ts`, add the import:

```typescript
import { checkDifftAvailable } from './loadFileDiff';
```

In `main()`, before the `serve()` call, add:

```typescript
const difftAvailable = await checkDifftAvailable();
console.log(`[server] difft available: ${difftAvailable}`);
```

Then update the `MessageRouter` constructor call to pass `difftAvailable`:

```typescript
const router = new MessageRouter(dataSource, state, repoManager, avatarManager, repoPath, difftAvailable);
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/farmahuang/git-graph-web && bunx tsc --project server/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts server/index.ts
git commit -m "feat: wire loadFileDiff handler into MessageRouter"
```

---

## Chunk 2: Frontend Utility + CSS

### Task 5: Implement `web/ansiToHtml.ts`

**Files:**
- Create: `web/ansiToHtml.ts`
- Create: `web/ansiToHtml.test.ts`

The 256-colour palette is: indices 0-15 = standard colours (see below), 16-231 = 6×6×6 colour cube, 232-255 = greyscale ramp.

- [ ] **Step 1: Write failing tests**

Create `web/ansiToHtml.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { ansiToHtml } from './ansiToHtml';

describe('ansiToHtml', () => {
	it('returns plain text unchanged', () => {
		expect(ansiToHtml('hello world')).toBe('hello world');
	});

	it('escapes HTML special chars', () => {
		expect(ansiToHtml('<b>&"')).toBe('&lt;b&gt;&amp;&quot;');
	});

	it('applies standard foreground colour (red = 31)', () => {
		const result = ansiToHtml('\x1b[31mred\x1b[0m');
		expect(result).toContain('color:#c00000');
		expect(result).toContain('>red<');
	});

	it('applies bright foreground colour (bright green = 92)', () => {
		const result = ansiToHtml('\x1b[92mgreen\x1b[0m');
		expect(result).toContain('color:#00ff00');
	});

	it('applies 256-colour foreground', () => {
		// colour 196 = pure red in 256-palette cube
		const result = ansiToHtml('\x1b[38;5;196mred256\x1b[0m');
		expect(result).toContain('color:');
		expect(result).toContain('>red256<');
	});

	it('applies truecolor foreground', () => {
		const result = ansiToHtml('\x1b[38;2;255;128;0morange\x1b[0m');
		expect(result).toContain('color:rgb(255,128,0)');
	});

	it('applies bold', () => {
		const result = ansiToHtml('\x1b[1mbold\x1b[0m');
		expect(result).toContain('font-weight:bold');
	});

	it('strips unknown sequences silently', () => {
		const result = ansiToHtml('\x1b[99munknown\x1b[0m');
		expect(result).toBe('unknown');
	});

	it('handles mixed colour + bold', () => {
		const result = ansiToHtml('\x1b[1;31mbold red\x1b[0m');
		expect(result).toContain('font-weight:bold');
		expect(result).toContain('color:#c00000');
	});

	it('resets state after reset sequence', () => {
		const result = ansiToHtml('\x1b[31mred\x1b[0m normal');
		// "normal" should not have the red colour
		expect(result).not.toContain('>normal<');  // no span around normal
		expect(result.endsWith(' normal')).toBe(true);
	});
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /Users/farmahuang/git-graph-web && bun test web/ansiToHtml.test.ts
```

Expected: import error (file doesn't exist yet).

- [ ] **Step 3: Implement `web/ansiToHtml.ts`**

Create `web/ansiToHtml.ts`:

```typescript
// Standard 16-colour palette (0-7 normal, 8-15 bright)
const ANSI_16_COLOURS: string[] = [
	'#000000', '#c00000', '#00c000', '#c0c000',
	'#0000c0', '#c000c0', '#00c0c0', '#c0c0c0',
	'#808080', '#ff0000', '#00ff00', '#ffff00',
	'#0000ff', '#ff00ff', '#00ffff', '#ffffff'
];

function build256Palette(): string[] {
	const palette: string[] = [...ANSI_16_COLOURS];
	// 16-231: 6x6x6 colour cube
	for (let r = 0; r < 6; r++) {
		for (let g = 0; g < 6; g++) {
			for (let b = 0; b < 6; b++) {
				const rv = r === 0 ? 0 : 55 + r * 40;
				const gv = g === 0 ? 0 : 55 + g * 40;
				const bv = b === 0 ? 0 : 55 + b * 40;
				palette.push(`rgb(${rv},${gv},${bv})`);
			}
		}
	}
	// 232-255: greyscale ramp
	for (let i = 0; i < 24; i++) {
		const v = 8 + i * 10;
		palette.push(`rgb(${v},${v},${v})`);
	}
	return palette;
}

const PALETTE_256 = build256Palette();

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

interface AnsiState {
	fg: string | null;
	bg: string | null;
	bold: boolean;
}

function stateToStyle(state: AnsiState): string {
	const parts: string[] = [];
	if (state.bold) parts.push('font-weight:bold');
	if (state.fg) parts.push(`color:${state.fg}`);
	if (state.bg) parts.push(`background:${state.bg}`);
	return parts.join(';');
}

function isActive(state: AnsiState): boolean {
	return state.bold || state.fg !== null || state.bg !== null;
}

export function ansiToHtml(input: string): string {
	// Regex: match ESC[ ... m sequences
	const ESC_SEQ = /\x1b\[([0-9;]*)m/g;
	let result = '';
	let state: AnsiState = { fg: null, bg: null, bold: false };
	let spanOpen = false;
	let lastIndex = 0;

	const closeSpan = () => {
		if (spanOpen) { result += '</span>'; spanOpen = false; }
	};

	const openSpanIfNeeded = () => {
		if (isActive(state)) {
			result += `<span style="${stateToStyle(state)}">`;
			spanOpen = true;
		}
	};

	let match: RegExpExecArray | null;
	while ((match = ESC_SEQ.exec(input)) !== null) {
		// Append text before this sequence
		const textBefore = input.slice(lastIndex, match.index);
		if (textBefore) result += escapeHtml(textBefore);
		lastIndex = match.index + match[0].length;

		// Parse the codes
		const codes = match[1] === '' ? [0] : match[1].split(';').map(Number);
		closeSpan();

		let i = 0;
		while (i < codes.length) {
			const code = codes[i];
			if (code === 0) {
				state = { fg: null, bg: null, bold: false };
			} else if (code === 1) {
				state.bold = true;
			} else if (code >= 30 && code <= 37) {
				state.fg = ANSI_16_COLOURS[code - 30];
			} else if (code >= 40 && code <= 47) {
				state.bg = ANSI_16_COLOURS[code - 40];
			} else if (code >= 90 && code <= 97) {
				state.fg = ANSI_16_COLOURS[code - 90 + 8];
			} else if (code >= 100 && code <= 107) {
				state.bg = ANSI_16_COLOURS[code - 100 + 8];
			} else if (code === 38 && codes[i + 1] === 5) {
				state.fg = PALETTE_256[codes[i + 2]] ?? null;
				i += 2;
			} else if (code === 48 && codes[i + 1] === 5) {
				state.bg = PALETTE_256[codes[i + 2]] ?? null;
				i += 2;
			} else if (code === 38 && codes[i + 1] === 2) {
				state.fg = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
				i += 4;
			} else if (code === 48 && codes[i + 1] === 2) {
				state.bg = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
				i += 4;
			}
			// unknown codes are silently ignored
			i++;
		}

		openSpanIfNeeded();
	}

	// Remaining text after last sequence
	const tail = input.slice(lastIndex);
	if (tail) result += escapeHtml(tail);
	closeSpan();

	return result;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /Users/farmahuang/git-graph-web && bun test web/ansiToHtml.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/ansiToHtml.ts web/ansiToHtml.test.ts
git commit -m "feat: add ansiToHtml utility with 256-colour and truecolor support"
```

---

### Task 6: Add `web/styles/diff.css` and import it

**Files:**
- Create: `web/styles/diff.css`
- Modify: `web/index.html`

- [ ] **Step 1: Create `web/styles/diff.css`**

```css
.fileTreeFileDiff {
	font-family: var(--vscode-editor-font-family, monospace);
	font-size: 12px;
	overflow-x: auto;
	white-space: pre;
	padding: 8px 0;
	background: var(--vscode-editor-background, #1e1e1e);
	border-top: 1px solid var(--vscode-panel-border, #444);
}

.fileTreeFileDiff.loading {
	padding: 8px;
	color: var(--vscode-foreground, #ccc);
	font-style: italic;
}

.fileTreeFileDiff.error {
	padding: 8px;
	color: var(--vscode-errorForeground, #f48771);
	font-style: italic;
}

.fileTreeDiffToggle {
	display: inline-block;
	width: 14px;
	cursor: pointer;
	user-select: none;
	color: var(--vscode-foreground, #ccc);
	opacity: 0.7;
	margin-right: 2px;
	font-size: 10px;
}

.fileTreeDiffToggle:hover {
	opacity: 1;
}
```

- [ ] **Step 2: Add `<link>` to `web/index.html`**

In `web/index.html`, after the last existing stylesheet `<link>` (e.g. after `contextMenu.css`), add:

```html
  <link rel="stylesheet" href="./styles/diff.css">
```

- [ ] **Step 3: Commit**

```bash
git add web/styles/diff.css web/index.html
git commit -m "feat: add diff.css stylesheet for inline diff block"
```

---

## Chunk 3: Frontend Integration

### Task 7: Add diff cache + expand icon to `web/main.ts`

**Context on the codebase:**
- `sendMessage(msg)` is the function to send a WebSocket message (imported at line 22)
- `this.expandedCommit` is `ExpandedCommit | null` (line 58)
- `generateFileTreeLeafHtml(...)` at line 3613 is an **exported** top-level function with 6 params
- Two internal call sites: line 3574 and line 3608
- `this.expandedCommit =` is assigned at lines: 149 (state restore), 770 (`saveExpandedCommitLoading`), 2406 (set to `null`)
- Cache key format: `${commitHash}:0:${oldFilePath ?? ''}:${filePath}` — the `data-diffkey` attribute on the diff div will store this key directly to avoid fragile DOM queries

**Files:**
- Modify: `web/main.ts`

- [ ] **Step 1: Add the diff cache property to `GitGraphView` class**

After `private expandedCommit: ExpandedCommit | null = null;` (line 58), add:

```typescript
private fileDiffCache = new Map<string, { expanded: boolean; loading: boolean; html: string | null; error: string | null }>();
```

- [ ] **Step 2: Clear the cache at all three `expandedCommit` assignment sites**

```bash
grep -n "this\.expandedCommit = " /Users/farmahuang/git-graph-web/web/main.ts
```

There are exactly 3 assignment sites (lines 149, 770, 2406). After **each** of the three assignments, add:

```typescript
this.fileDiffCache.clear();
```

- [ ] **Step 3: Add `requestLoadFileDiff` method to `GitGraphView`**

After the `requestCommitDetails` method (around line 699), add:

```typescript
private requestLoadFileDiff(commitHash: string, filePath: string, oldFilePath: string | undefined, hasParents: boolean, isDeleted: boolean) {
    sendMessage({
        command: 'loadFileDiff',
        commitHash,
        filePath,
        oldFilePath,
        hasParents,
        isDeleted,   // if true, server diffs old side → /dev/null (file was removed)
        parentIndex: 0
    });
}
```

Also add `isDeleted: boolean` to `RequestLoadFileDiff` in `server/types.ts` (do this in Task 1). In `server/loadFileDiff.ts`, when `isDeleted === true`:
- Old side: `git show <oldRef>:<oldPath>` → temp file
- New side: `/dev/null` (file was deleted at this commit)
- For the git fallback: `git diff --color=always <oldRef>:<oldPath> /dev/null` or `git show --color=always <commitHash> -- <filePath>` (git show on a deletion shows the removed content as `-` lines, which is correct).

- [ ] **Step 4: Modify `generateFileTreeLeafHtml` to add the expand icon and diff div**

Add `showDiffToggle: boolean` as the 7th parameter:

```typescript
export function generateFileTreeLeafHtml(
    name: string,
    leaf: FileTreeLeaf,
    gitFiles: ReadonlyArray<GG.GitFileChange>,
    lastViewedFile: string | null,
    fileContextMenuOpen: number,
    isUncommitted: boolean,
    showDiffToggle: boolean   // NEW: pass true only in non-comparison, non-stash commit detail views
)
```

In the `leaf.type === 'file'` branch, before the `return`, compute:

```typescript
// Mirror the existing `diffPossible` logic — show toggle for text files and untracked files,
// but NOT for binary files (additions/deletions are null and type is not Untracked).
// Deleted files CAN have a diff (showing what was removed), so they are included.
const canToggleDiff = showDiffToggle && (fileTreeFile.type === GG.GitFileStatus.Untracked || textFile);
// Cache key stored on the DOM element so the response handler can look it up directly
const diffCacheKey = `0:${fileTreeFile.type === GG.GitFileStatus.Renamed ? encodeURIComponent(fileTreeFile.oldFilePath) : ''}:${encodeURIComponent(fileTreeFile.newFilePath)}`;
const toggleIcon = canToggleDiff
    ? '<span class="fileTreeDiffToggle"'
      + ' data-diffpath="' + encodeURIComponent(fileTreeFile.newFilePath) + '"'
      + ' data-oldpath="' + encodeURIComponent(fileTreeFile.type === GG.GitFileStatus.Renamed ? fileTreeFile.oldFilePath : '') + '"'
      + ' data-deleted="' + (fileTreeFile.type === GG.GitFileStatus.Deleted ? '1' : '0') + '"'
      + ' title="Toggle inline diff">&#9654;</span>'
    : '';
const diffDiv = canToggleDiff
    ? '<div class="fileTreeFileDiff" data-diffpath="' + encodeURIComponent(fileTreeFile.newFilePath) + '" style="display:none"></div>'
    : '';
```

Modify the `return` statement:
- Prefix the inner content of `<span class="fileTreeFileRecord">` with `toggleIcon +`
- Change the closing `</span></li>` at the end to `</span>` + `diffDiv` + `</li>`

The return currently ends with:
```
... + '</span></li>';
```
Change to:
```
... + '</span>' + diffDiv + '</li>';
```

- [ ] **Step 5: Update the two internal call sites**

Lines 3574 and 3608 call `generateFileTreeLeafHtml(...)` with 6 args. Both need a 7th arg.

Determine `showDiffToggle` at each call site: pass `true` only when:
- rendering for `showCommitDetails` (non-comparison view, no stash) — grep for the context around line 3574/3608

In practice: find what calls the function that contains lines 3574/3608. Look at the enclosing function's signature and check whether `expandedCommit.compareWithHash` is null and no stash. Pass the result as a boolean directly — e.g., compute it before generating the tree HTML and pass it down. If uncertain, pass `false` (safe default, no icon shown) and fix later.

- [ ] **Step 6: Add click listener for `.fileTreeDiffToggle`**

In the event listener section (near the other `addListenerToClass` calls around line 2993), add:

```typescript
addListenerToClass('fileTreeDiffToggle', 'click', (e: Event) => {
    e.stopPropagation();
    const toggleElem = <HTMLElement>(<Element>e.target).closest('.fileTreeDiffToggle');
    const expandedCommit = this.expandedCommit;
    if (toggleElem === null || expandedCommit === null) return;

    const filePath = decodeURIComponent(toggleElem.getAttribute('data-diffpath') ?? '');
    const oldFilePathRaw = decodeURIComponent(toggleElem.getAttribute('data-oldpath') ?? '');
    const oldFilePath = oldFilePathRaw || undefined;
    const isDeleted = toggleElem.getAttribute('data-deleted') === '1';
    const cacheKey = `${expandedCommit.commitHash}:0:${oldFilePath ?? ''}:${filePath}`;

    // Find the diff div: it's the next sibling element after the fileTreeFileRecord span, inside the same <li>
    const li = toggleElem.closest('li');
    const diffDiv = li?.querySelector('.fileTreeFileDiff') as HTMLElement | null;
    if (diffDiv === null) return;

    const cached = this.fileDiffCache.get(cacheKey);

    if (cached && cached.loading) return; // debounce double-click

    if (cached && (cached.html !== null || cached.error !== null)) {
        // Toggle collapse/expand using cached content
        const nowExpanded = !cached.expanded;
        cached.expanded = nowExpanded;
        diffDiv.style.display = nowExpanded ? 'block' : 'none';
        toggleElem.innerHTML = nowExpanded ? '&#9660;' : '&#9654;';
        return;
    }

    // First load: send WS request
    this.fileDiffCache.set(cacheKey, { expanded: true, loading: true, html: null, error: null });
    // Store the cache key on the div so the response handler can find it without fragile key matching
    diffDiv.setAttribute('data-cachekey', cacheKey);
    diffDiv.classList.add('loading');
    diffDiv.style.display = 'block';
    diffDiv.textContent = 'Loading diff…';
    toggleElem.innerHTML = '&#9660;';

    const commit = this.commits[this.commitLookup[expandedCommit.commitHash]];
    this.requestLoadFileDiff(
        expandedCommit.commitHash,
        filePath,
        oldFilePath,
        (commit?.parents?.length ?? 0) > 0,
        isDeleted
    );
});
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd /Users/farmahuang/git-graph-web && bunx tsc --project web/tsconfig.json --noEmit
```

Fix any type errors before proceeding. Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add web/main.ts
git commit -m "feat: add diff toggle icon and cache to file tree"
```

---

### Task 8: Handle `loadFileDiff` response in `web/main.ts`

**Context:** Incoming WebSocket messages are dispatched via a large `switch (msg.command)` (search for `case 'commitDetails':` to find it, around line 527+).

The response handler uses `data-cachekey` attribute set by the click handler to find the correct div — this avoids fragile DOM queries and key-matching loops.

**Files:**
- Modify: `web/main.ts`

- [ ] **Step 1: Add import for `ansiToHtml`**

At the top of `web/main.ts` with the other imports (line 1–10), add:

```typescript
import { ansiToHtml } from './ansiToHtml';
```

- [ ] **Step 2: Add `loadFileDiff` case to the incoming message switch**

Find the `switch (msg.command)` that handles incoming responses. Add:

```typescript
case 'loadFileDiff': {
    const expandedCommit = this.expandedCommit;
    // Discard stale responses: panel closed, different commit selected, or comparison view active
    if (expandedCommit === null
        || msg.commitHash !== expandedCommit.commitHash
        || expandedCommit.compareWithHash !== null) break;

    // Find the diff div using the cache key stored on it during the click handler
    const cacheKey = `${msg.commitHash}:0:${(msg as any).oldFilePath ?? ''}:${msg.filePath}`;
    // Use data-cachekey attribute for direct DOM lookup — set during click handler
    const diffDiv = document.querySelector(`.fileTreeFileDiff[data-cachekey="${CSS.escape(cacheKey)}"]`) as HTMLElement | null;

    let html: string;
    let errorMsg: string | null = null;

    if (msg.error !== null) {
        errorMsg = msg.error;
        html = escapeHtml(msg.error);
    } else if (!msg.diff || msg.diff.trim() === '') {
        html = '<em>No changes</em>';
    } else {
        html = ansiToHtml(msg.diff);
    }

    this.fileDiffCache.set(cacheKey, { expanded: true, loading: false, html, error: errorMsg });

    if (diffDiv !== null) {
        diffDiv.classList.remove('loading');
        if (errorMsg !== null) diffDiv.classList.add('error');
        diffDiv.innerHTML = `<pre style="margin:0;padding:0">${html}</pre>`;
        diffDiv.style.display = 'block';
    }
    break;
}
```

**Note on `CSS.escape`:** this is a standard browser API that escapes special characters in CSS selector strings. It is available in all modern browsers and in the VS Code webview.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/farmahuang/git-graph-web && bunx tsc --project web/tsconfig.json --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Run all tests**

```bash
cd /Users/farmahuang/git-graph-web && bun test
```

Expected: all existing tests still pass; new tests pass. If `generateFileTreeLeafHtml` is called in any test file, update those calls to pass the new 7th argument (`false`).

- [ ] **Step 5: Commit**

```bash
git add web/main.ts
git commit -m "feat: handle loadFileDiff WS response and render inline diff"
```

---

## Chunk 4: Cleanup + README + Branch

### Task 9: Update README + create PR branch

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add difft note to README**

In `README.md`, add a new section after the "Requirements" section:

```markdown
## Optional: difftastic

Install [difftastic](https://github.com/Wilfred/difftastic) for syntax-aware inline diffs:

```bash
# macOS
brew install difftastic

# Cargo
cargo install difftastic
```

If `difft` is not on the server's PATH, inline diffs fall back to `git diff` output.
```

- [ ] **Step 2: Run full test suite one final time**

```bash
cd /Users/farmahuang/git-graph-web && bun test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: note difftastic as optional dependency for inline diffs"
```

- [ ] **Step 4: Push the feature branch**

```bash
git push -u origin feat/inline-file-diff
```

---

## Implementation Notes

**Branch to create before starting:**
```bash
git checkout -b feat/inline-file-diff
```

**Running the dev server to manually test:**
```bash
GIT_GRAPH_WEB_REPO_PATH=$(pwd) bun run dev
# Open http://localhost:5173, click a commit, click the ▶ icon on a file
```

**Key invariants to verify manually:**
1. Stash commits: no `▶` icon visible
2. Deleted files: no `▶` icon visible
3. Click `▶` → spinner → diff appears
4. Click `▼` → diff collapses, no re-fetch (check Network tab — no new WS message)
5. Click different commit → cache clears → clicking `▶` fetches fresh diff
