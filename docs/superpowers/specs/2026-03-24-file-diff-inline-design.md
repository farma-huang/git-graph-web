# Inline File Diff with Difftastic

**Date:** 2026-03-24
**Status:** Approved

## Problem

When viewing commit details, users can see the changed file list (`fileTreeFileRecord`) but cannot see the actual diff content inline.

## Goal

Allow users to click an expand icon on a `fileTreeFileRecord` row to see an inline diff block below it, powered by difftastic (`difft`) with fallback to `git diff`.

---

## Design

### UX Behaviour

- Each `fileTreeFileRecord` row gets an expand icon (`▶`/`▼`) at the start
- Click icon → expands `fileTreeFileDiff` block; spinner while loading
- Click again → collapses; cached content reused (no re-fetch)
- Double-click while loading is ignored
- Expand icon **not rendered** for:
  - Stash commits (`commit.stash !== null`)
  - Comparison view (`expandedCommit.compareWithHash !== null`)
  - Deleted files (`file.type === GitFileStatus.Deleted`) — `git show <commitHash>:<path>` fails for deleted files
- Response is discarded if `response.commitHash !== this.expandedCommit?.commitHash` (stale response guard)
- "No syntactic changes" output from difftastic → displayed as plain message, not error

### Out of Scope

- Stash commits, comparison view, uncommitted pseudo-hash (`'*'`)

---

### WebSocket Protocol

Follows existing patterns (`BaseMessage`, `ResponseWithErrorInfo`). **Does not extend `RepoRequest`** — server uses `this.repoPath` from `MessageRouter` constructor, same as all other handlers; no `repo` field on request (consistent with existing implementation pattern, not the type-level pattern).

**Request:**
```typescript
interface RequestLoadFileDiff extends BaseMessage {
  readonly command: 'loadFileDiff';
  readonly commitHash: string;
  readonly filePath: string;        // new path (or only path)
  readonly oldFilePath?: string;    // renames only — old side path
  readonly hasParents: boolean;     // true if commit.parents.length > 0
  readonly parentIndex: number;     // which parent; always 0 in this iteration
}
```

**Response:**
```typescript
interface ResponseLoadFileDiff extends BaseMessage {
  readonly command: 'loadFileDiff';
  readonly commitHash: string;      // echoed from request — required for stale-response guard
  readonly filePath: string;        // echoed from request — required for cache key lookup
  readonly diff: string | null;     // ANSI output; null on error
  readonly format: 'difftastic' | 'git';
  readonly error: string | null;
  // requestId + refreshId grafted by MessageRouter.send()
  // refreshId is not used for refresh-gating on this command
}
```

**Union types:** `RequestLoadFileDiff` and `ResponseLoadFileDiff` must be added to the `RequestMessage` and `ResponseMessage` union types in `types.ts`. Required for the `switch` in `MessageRouter.handleMessage` to type-check correctly.

---

### Server (`server/index.ts` + `server/routes.ts`)

**difft availability — cached once at startup (before `serve()`):**

```typescript
let difftAvailable = false;
try {
  // Spawn with --version to test PATH availability in the server's process environment
  const p = Bun.spawn(['difft', '--version'], { stdout: 'pipe', stderr: 'pipe' });
  await p.exited;
  difftAvailable = p.exitCode === 0;
} catch {
  // ENOENT = not found; any other error also means unavailable
  difftAvailable = false;
}
```

`difftAvailable` is module-level. Pass into `MessageRouter` constructor. Never re-checked per request.

Note: `difft` must be on the PATH of the process running the server (not just the user's shell). Document this in README.

**Handler — `loadFileDiff` case:**

1. **Guard:** `commitHash === UNCOMMITTED` (`'*'`) → return `{ commitHash, filePath, diff: null, format: 'git', error: 'Cannot diff uncommitted changes' }`
2. **Old ref:** `hasParents === false` → `oldRef = null` (will use `/dev/null`); else `oldRef = '${commitHash}~${parentIndex}'`
3. **Paths:** `oldPath = oldFilePath ?? filePath`; `newPath = filePath`
4. **Temp file dir:** `os.tmpdir()` from Node/Bun built-in. Suffix = `crypto.randomUUID()` (not `requestId`) to prevent path traversal.
   - `oldTmpFile = join(tmpdir(), 'gitgraphweb-' + uuid + '-old')`
   - `newTmpFile = join(tmpdir(), 'gitgraphweb-' + uuid + '-new')`
   - On process crash temp files may be orphaned — acceptable; `os.tmpdir()` is cleaned by the OS.
5. **If `difftAvailable`:**
   - If `oldRef !== null`: `git show <oldRef>:<oldPath>` → write to `oldTmpFile`; old side arg = `oldTmpFile`
   - If `oldRef === null`: old side arg = `/dev/null` (no temp file written for old side)
   - `git show <commitHash>:<newPath>` → write to `newTmpFile`
   - `difft --color always <oldSideArg> <newTmpFile>` with 30s timeout; kill on breach
   - `finally`: delete temp files that were created (skip `/dev/null`)
   - Return `{ commitHash, filePath, diff: stdout, format: 'difftastic', error: null }`
6. **Else (fallback):**
   - New file (`oldRef === null`): `git show --color=always <commitHash> -- <filePath>`
   - Otherwise: `git diff --color=always <oldRef>:<oldPath> <commitHash>:<newPath>`
   - Return `{ commitHash, filePath, diff: stdout, format: 'git', error: null }`
7. **Error/timeout:** return `{ commitHash, filePath, diff: null, format: 'git', error: message }`

---

### Frontend (`web/`)

#### `web/ansiToHtml.ts` — new utility

Converts ANSI escape sequences to `<span style="...">` elements. **Inline styles only** (no stylesheet dependency; theme-independent).

Must handle:
- Standard 16 fg/bg: `\x1b[30m`–`\x1b[37m`, `\x1b[90m`–`\x1b[97m`
- 256-colour: `\x1b[38;5;<n>m` / `\x1b[48;5;<n>m` → map using standard 256-colour palette
- Truecolor: `\x1b[38;2;<r>;<g>;<b>m` / `\x1b[48;2;<r>;<g>;<b>m` → `rgb(r,g,b)` inline style
- Bold: `\x1b[1m`
- Reset: `\x1b[0m`
- Unknown sequences → strip silently

#### Diff cache — in `web/main.ts`

```typescript
type FileDiffState = {
  expanded: boolean;
  loading: boolean;
  html: string | null;   // null = not yet fetched
  error: string | null;
};

// key: `${commitHash}:${parentIndex}:${oldFilePath ?? ''}:${filePath}`
// oldFilePath included to handle renames where newFilePath could theoretically repeat
private fileDiffCache = new Map<string, FileDiffState>();
```

**Cache invalidation:** clear `fileDiffCache` whenever `this.expandedCommit` is set to a new value (different commit or panel close). Revisiting the same commit will re-fetch — acceptable to avoid stale diffs after amend + refresh.

#### Rendering changes in `web/main.ts`

Expand icon rendered only when:
- `expandedCommit.compareWithHash === null`
- `commit.stash === null`
- `file.type !== GitFileStatus.Deleted`

On icon click:
1. Compute key `${commitHash}:${parentIndex}:${oldFilePath ?? ''}:${filePath}`
2. Cache lookup:
   - `loading: true` → ignore (debounce)
   - `html !== null || error !== null` → toggle `expanded`, update `display`, done
   - No entry → insert `{ expanded: true, loading: true, html: null, error: null }`, show spinner, send `loadFileDiff` WS message

On `loadFileDiff` WS response:
1. If `response.commitHash !== this.expandedCommit?.commitHash` → discard (stale)
2. Compute same cache key from `response.commitHash`, `response.filePath` (parentIndex always 0, oldFilePath not in response — use the locally tracked value, or key only by `commitHash:filePath` for response lookup since parentIndex=0 always in this iteration)
3. Convert `response.diff` ANSI → HTML; wrap in `<pre>`
4. Update cache: `{ loading: false, expanded: true, html, error: response.error }`
5. Inject into `fileTreeFileDiff` div, remove spinner, set `display: block`

#### `web/styles/diff.css` — new file

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
```

Imported via `<link>` in `web/index.html` (matches project convention: `main.css`, `dialog.css`, etc.).

---

### Error Handling

| Scenario | Behaviour |
|----------|-----------|
| `difft` not found at startup | `difftAvailable = false`; git diff fallback for all requests |
| `commitHash === '*'` | Friendly error; no subprocess |
| Stash commit | Expand icon not rendered |
| Comparison view | Expand icon not rendered |
| Deleted file | Expand icon not rendered |
| `hasParents === false` | Old side is `/dev/null` |
| Merge commit | Diff against parent `parentIndex` (always 0 in this iteration) |
| Binary file | difftastic: "Binary files are not supported"; git: "Binary files differ"; shown as-is |
| "No syntactic changes" | Shown as plain text, not error |
| Subprocess timeout (30s) | Kill, return error |
| Temp file leak on crash | Orphaned in `os.tmpdir()`; cleaned by OS |
| Both tools fail | `error` string shown in expanded block |
| Stale response | `response.commitHash !== expandedCommit.commitHash` → discard |
| Double-click while loading | Ignored |

---

### Testing

**Server:**
- `difftAvailable` cached once, not per-request (verify call count)
- Temp names use `crypto.randomUUID()`, not `requestId`
- `finally` cleans up on success, error, and timeout
- `UNCOMMITTED` guard: no subprocess spawned
- `hasParents === false`: old side is `/dev/null`, no old temp file written
- `parentIndex: 1`: old ref is `commitHash~1`
- Timeout (30s): process killed, error returned
- `commitHash` echoed in all response paths

**Frontend:**
- `ansiToHtml`: 16-colour, 256-colour, truecolor, bold, reset, mixed, unknown stripped
- Cache key includes `oldFilePath` component
- Cache cleared on `expandedCommit` change
- Double-click while loading: exactly one WS message sent
- Stash/comparison/deleted: expand icon not rendered
- Stale response discarded (commitHash mismatch)

---

### Files Changed

| File | Change |
|------|--------|
| `server/index.ts` | Cache `difftAvailable` at startup; pass to `MessageRouter` |
| `server/routes.ts` | Add `loadFileDiff` case |
| `server/types.ts` | Add `RequestLoadFileDiff`, `ResponseLoadFileDiff`; add both to `RequestMessage` and `ResponseMessage` union types |
| `web/ansiToHtml.ts` | New ANSI → HTML utility |
| `web/main.ts` | Expand icon rendering (with exclusions), diff cache, `loadFileDiff` response handler |
| `web/styles/diff.css` | New stylesheet |
| `web/index.html` | `<link>` import for `diff.css` |
| `README.md` | Note that `difft` must be on server PATH |
