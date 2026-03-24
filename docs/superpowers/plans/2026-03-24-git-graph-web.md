# git-graph-web Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the vscode-git-graph VSCode extension to a standalone browser app using Bun (HTTP + WebSocket backend) and Vite (frontend bundler), preserving the original frontend code with minimal changes.

**Architecture:** Bun server handles all git operations via `child_process.spawn` and communicates with the browser frontend over WebSocket (all git messages) and HTTP (static assets, avatars, diffs). The original `web/` frontend TypeScript is preserved almost entirely; only a new `vscodeApi.ts` shim replaces `acquireVsCodeApi()` to route messages over WebSocket instead of the VSCode postMessage API.

**Tech Stack:** Bun (runtime + SQLite), Vite (frontend dev server + bundler), TypeScript (vanilla, no framework), nanoid (requestId generation)

---

## Chunk 1: Project Scaffold + Types

### File Map

| File | Action | Responsibility |
|---|---|---|
| `package.json` | Create | Dependencies, scripts |
| `bunfig.toml` | Create | Bun config |
| `tsconfig.json` | Create | Root TS config |
| `server/tsconfig.json` | Create | Server TS config |
| `web/tsconfig.json` | Create | Web TS config (matches original) |
| `server/types.ts` | Create | All shared types ported from original `src/types.ts` |
| `server/utils/disposable.ts` | Create | Port original `src/utils/disposable.ts` |
| `server/utils/event.ts` | Create | Port original `src/utils/event.ts` |
| `server/logger.ts` | Create | Console-based logger (replaces VSCode logger) |
| `.gitignore` | Create | Standard Node/Bun ignores |

---

### Task 1: Clone original source

**Files:**
- No project files modified

- [ ] **Step 1: Clone the upstream repo into a temp directory**

```bash
git clone --branch develop --depth 1 https://github.com/mhutchie/vscode-git-graph.git /tmp/vscode-git-graph-src
```

Expected: Clones successfully, `/tmp/vscode-git-graph-src/src/` and `/tmp/vscode-git-graph-src/web/` exist.

- [ ] **Step 2: Verify key source files exist**

```bash
ls /tmp/vscode-git-graph-src/src/{types,dataSource,repoManager,avatarManager,extensionState,config,utils}.ts
ls /tmp/vscode-git-graph-src/web/{main,graph,dialog,contextMenu,dropdown,findWidget,settingsWidget,textFormatter,utils}.ts
```

Expected: All files listed without error.

- [ ] **Step 3: Confirm clone path for all subsequent tasks**

All "Copy src/..." steps in Tasks 3–9 assume the upstream source is at `/tmp/vscode-git-graph-src/`. If this path does not exist on your machine (e.g. after a reboot), re-run Step 1 before proceeding.

---

### Task 2: Package.json, tsconfig, and project scaffold

**Files:**
- Create: `package.json`
- Create: `bunfig.toml`
- Create: `tsconfig.json`
- Create: `server/tsconfig.json`
- Create: `web/tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
dist/
out/
*.js.map
.superpowers/
~/.git-graph-web/
```

Write to `/Users/farmahuang/git-graph-web/.gitignore`.

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "git-graph-web",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "concurrently \"bun run server:dev\" \"bun run web:dev\"",
    "server:dev": "bun --watch server/index.ts",
    "web:dev": "vite",
    "build": "vite build",
    "start": "bun server/index.ts",
    "test": "bun test"
  },
  "dependencies": {
    "nanoid": "^5.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "concurrently": "^8.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0"
  }
}
```

Write to `/Users/farmahuang/git-graph-web/package.json`.

- [ ] **Step 3: Create `bunfig.toml`**

```toml
[test]
preload = []
```

Write to `/Users/farmahuang/git-graph-web/bunfig.toml`.

- [ ] **Step 4: Create root `tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "./server" },
    { "path": "./web" }
  ]
}
```

Write to `/Users/farmahuang/git-graph-web/tsconfig.json`.

- [ ] **Step 5: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "../out/server",
    "rootDir": ".",
    "composite": true,
    "types": ["bun-types"]
  },
  "include": ["./**/*.ts"]
}
```

Write to `/Users/farmahuang/git-graph-web/server/tsconfig.json`.

- [ ] **Step 6: Create `web/tsconfig.json`** (match original web/tsconfig.json)

```bash
cp /tmp/vscode-git-graph-src/web/tsconfig.json /Users/farmahuang/git-graph-web/web/tsconfig.json
```

Then edit to remove `outDir` (Vite handles output) and update `include` if needed.

- [ ] **Step 7: Install dependencies**

```bash
cd /Users/farmahuang/git-graph-web && bun install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 8: Commit**

```bash
cd /Users/farmahuang/git-graph-web
git add package.json bunfig.toml tsconfig.json server/tsconfig.json web/tsconfig.json .gitignore
git commit -m "chore: project scaffold - package.json, tsconfigs"
```

---

### Task 3: Port utility modules

**Files:**
- Create: `server/utils/disposable.ts` (port from `src/utils/disposable.ts`)
- Create: `server/utils/event.ts` (port from `src/utils/event.ts`)
- Create: `server/logger.ts` (new, replaces VSCode logger)

- [ ] **Step 1: Copy and adapt `server/utils/disposable.ts`**

```bash
cp /tmp/vscode-git-graph-src/src/utils/disposable.ts /Users/farmahuang/git-graph-web/server/utils/disposable.ts
```

Remove `import * as vscode from 'vscode'` and any vscode-specific code. The disposable pattern is pure TypeScript, so it should need no changes beyond removing vscode imports.

- [ ] **Step 2: Copy and adapt `server/utils/event.ts`**

```bash
cp /tmp/vscode-git-graph-src/src/utils/event.ts /Users/farmahuang/git-graph-web/server/utils/event.ts
```

Remove any vscode imports.

- [ ] **Step 3: Create `server/logger.ts`**

The original logger writes to VSCode's output channel. Replace with console:

```typescript
// server/logger.ts
export class Logger {
  private readonly prefix: string;

  constructor(prefix: string = 'git-graph-web') {
    this.prefix = prefix;
  }

  log(message: string): void {
    console.log(`[${this.prefix}] ${message}`);
  }

  logError(message: string): void {
    console.error(`[${this.prefix}] ERROR: ${message}`);
  }

  logCmd(cmd: string, args: string[]): void {
    console.log(`[${this.prefix}] CMD: ${cmd} ${args.join(' ')}`);
  }
}
```

Write to `/Users/farmahuang/git-graph-web/server/logger.ts`.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/farmahuang/git-graph-web
bun x tsc -p server/tsconfig.json --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/farmahuang/git-graph-web
git add server/
git commit -m "chore: port utility modules (disposable, event, logger)"
```

---

### Task 4: Port types.ts

**Files:**
- Create: `server/types.ts` (port from `src/types.ts`, remove vscode-specific types)

- [ ] **Step 1: Copy types.ts**

```bash
cp /tmp/vscode-git-graph-src/src/types.ts /Users/farmahuang/git-graph-web/server/types.ts
```

- [ ] **Step 2: Remove vscode-specific types**

Open `server/types.ts` and remove or replace:
- Any `import * as vscode from 'vscode'` lines
- `TabIconColourTheme` (VSCode tab icon, not needed)
- Any type that directly references `vscode.*`

Keep all `RequestMessage`, `ResponseMessage`, `GitCommit`, `GitRepoState`, `GitGraphViewGlobalState`, `GitGraphViewWorkspaceState` and all git-related types intact.

- [ ] **Step 3: Add `requestId` to message types**

In `server/types.ts`, find the `RequestMessage` union type base and add `requestId` field to the base interface shared by all request messages. If there is no shared base, add it to each variant. The field is optional so the server can handle messages without it gracefully:

```typescript
// Add to each RequestMessage variant's interface, or a shared base:
requestId?: string;
```

Similarly ensure `ResponseMessage` variants can carry `requestId?`.

- [ ] **Step 4: Verify TS compiles**

```bash
cd /Users/farmahuang/git-graph-web
bun x tsc -p server/tsconfig.json --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/farmahuang/git-graph-web
git add server/types.ts
git commit -m "chore: port types.ts, add requestId to message types"
```

---

## Chunk 2: Server Core — Config, ExtensionState, DataSource

### File Map

| File | Action | Responsibility |
|---|---|---|
| `server/config.ts` | Create | Port original config, replace vscode.workspace.getConfiguration with JSON file + hardcoded defaults |
| `server/extensionState.ts` | Create | Port original ExtensionState, replace vscode.Memento with Bun SQLite |
| `server/dataSource.ts` | Create | Port original dataSource.ts (~2025 lines), remove vscode.* imports, keep git spawn logic intact |

---

### Task 5: Port config.ts

**Files:**
- Create: `server/config.ts`

- [ ] **Step 1: Copy config.ts**

```bash
cp /tmp/vscode-git-graph-src/src/config.ts /Users/farmahuang/git-graph-web/server/config.ts
```

- [ ] **Step 2: Replace vscode.workspace.getConfiguration**

The original reads: `vscode.workspace.getConfiguration('git-graph')`.

Replace the entire config loading mechanism with a function that:
1. Returns hardcoded defaults for all settings
2. Reads `~/.git-graph-web/config.json` if it exists and merges (shallow) over defaults
3. Only accepts these v1-supported keys from the config file (ignore all others silently):
   - `graph.colours` (array of hex strings)
   - `date.format` (string)
   - `commitOrdering` (string: "date" | "author-date" | "topo")

```typescript
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_PATH = join(homedir(), '.git-graph-web', 'config.json');
const SUPPORTED_KEYS = new Set(['graph.colours', 'date.format', 'commitOrdering']);

function loadUserConfig(): Partial<Record<string, unknown>> {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    return Object.fromEntries(Object.entries(raw).filter(([k]) => SUPPORTED_KEYS.has(k)));
  } catch {
    return {};
  }
}
```

Replace all `vscode.workspace.getConfiguration('git-graph').get('settingName', defaultValue)` calls with direct access to the merged config object.

- [ ] **Step 3: Remove all remaining vscode imports**

Search for `vscode` in `server/config.ts` and remove/replace every reference.

- [ ] **Step 4: Verify TS compiles**

```bash
cd /Users/farmahuang/git-graph-web
bun x tsc -p server/tsconfig.json --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/farmahuang/git-graph-web
git add server/config.ts
git commit -m "feat: port config.ts, replace vscode config with JSON file + hardcoded defaults"
```

---

### Task 6: Port extensionState.ts (Bun SQLite)

**Files:**
- Create: `server/extensionState.ts`

- [ ] **Step 1: Copy extensionState.ts**

```bash
cp /tmp/vscode-git-graph-src/src/extensionState.ts /Users/farmahuang/git-graph-web/server/extensionState.ts
```

- [ ] **Step 2: Replace vscode.Memento with Bun SQLite**

Replace the constructor signature and storage backend. The original stores data in `context.globalState` (key-value) and `context.workspaceState`. Replace both with a single SQLite database using the schema from the spec:

```typescript
import { Database } from 'bun:sqlite';
import { mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

function getDataDir(): string {
  return process.env.GIT_GRAPH_WEB_DATA_DIR ?? join(homedir(), '.git-graph-web');
}

export class ExtensionState {
  private readonly db: Database;

  constructor() {
    const dir = getDataDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.db = new Database(join(dir, 'state.db'));
    this.initSchema();
  }

  private initSchema(): void {
    // Generic key-value store for globalViewState, workspaceViewState, repoStates, etc.
    this.db.run(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    // Code review records (matches spec schema)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS code_reviews (
        repo TEXT NOT NULL,
        id TEXT NOT NULL,
        last_active_date INTEGER NOT NULL,
        files TEXT NOT NULL,
        PRIMARY KEY (repo, id)
      )
    `);
    // Avatar image cache (matches spec schema)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS avatars (
        email TEXT PRIMARY KEY,
        image BLOB NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);
  }

  private kvGet<T>(key: string, defaultValue: T): T {
    const row = this.db.query('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | null;
    if (!row) return defaultValue;
    try { return JSON.parse(row.value) as T; } catch { return defaultValue; }
  }

  private kvSet(key: string, value: unknown): void {
    this.db.run('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
  }
}
```

Port `getRepoState`/`setRepoState` using `kvGet`/`kvSet` with key `repoState:<repoPath>`.
Port `getGlobalViewState`/`setGlobalViewState` using `kvGet`/`kvSet` with key `globalViewState`.
Port `getWorkspaceViewState`/`setWorkspaceViewState` using `kvGet`/`kvSet` with key `workspaceViewState`.

For `getCodeReviews`/`saveCodeReview`/`endCodeReview`/`updateCodeReview`, map to the `code_reviews` table:
- `getCodeReviews(repo)` → `SELECT id, last_active_date, files FROM code_reviews WHERE repo = ?`, return as `{ [id]: { lastActive, lastViewedFile, remainingFiles } }`
- `saveCodeReview(repo, id, data)` → `INSERT OR REPLACE INTO code_reviews VALUES (repo, id, data.lastActive, JSON.stringify({ lastViewedFile: data.lastViewedFile, remainingFiles: data.remainingFiles }))`
- `endCodeReview(repo, id)` → `DELETE FROM code_reviews WHERE repo = ? AND id = ?`

- [ ] **Step 3: Port avatar storage**

The original stores avatars on disk at `globalStoragePath/avatars/`. Replace with:
- Store avatar images in the `avatars` SQLite table (BLOB column)
- Keep the same `getAvatarStoragePath()` interface but back it with SQLite

```typescript
saveAvatar(email: string, image: Buffer): void {
  this.db.run(
    'INSERT OR REPLACE INTO avatars (email, image, timestamp) VALUES (?, ?, ?)',
    [email, image, Date.now()]
  );
}

getAvatar(email: string): Buffer | null {
  const row = this.db.query('SELECT image FROM avatars WHERE email = ?').get(email) as { image: Buffer } | null;
  return row ? row.image : null;
}
```

- [ ] **Step 4: Remove all vscode imports**

Remove `import * as vscode from 'vscode'` and all `vscode.ExtensionContext`, `vscode.Memento` references.

- [ ] **Step 5: Verify TS compiles**

```bash
cd /Users/farmahuang/git-graph-web
bun x tsc -p server/tsconfig.json --noEmit
```

Expected: No errors.

- [ ] **Step 6: Write a test**

Create `server/extensionState.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ExtensionState } from './extensionState';
import { rmSync, existsSync } from 'fs';
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
    expect(retrieved?.toString()).toBe('fake-image-data');
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
```

Note: `ExtensionState` must respect `GIT_GRAPH_WEB_DATA_DIR` env var for the DB path (update the constructor to use this).

- [ ] **Step 7: Run tests**

```bash
cd /Users/farmahuang/git-graph-web
bun test server/extensionState.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/farmahuang/git-graph-web
git add server/extensionState.ts server/extensionState.test.ts
git commit -m "feat: port extensionState.ts with Bun SQLite backend"
```

---

### Task 7: Port dataSource.ts

**Files:**
- Create: `server/dataSource.ts` (~2025 lines, port from original)

This is the largest file. It spawns git commands and parses their output. The logic is pure Node.js / Bun compatible — only the VSCode API surface needs to be removed.

- [ ] **Step 1: Copy dataSource.ts**

```bash
cp /tmp/vscode-git-graph-src/src/dataSource.ts /Users/farmahuang/git-graph-web/server/dataSource.ts
```

- [ ] **Step 2: Remove vscode imports**

At the top of `server/dataSource.ts`:
- Remove `import * as vscode from 'vscode'`
- Remove `import { AskpassEnvironment, AskpassManager } from './askpass/askpassManager'` (askpass is removed in v1)

- [ ] **Step 3: Remove askpass integration**

In the constructor, remove:
```typescript
const askpassManager = new AskpassManager();
this.askpassEnv = askpassManager.getEnv();
this.register(askpassManager);
```

Replace `this.askpassEnv` usage in spawn calls with an empty env extension: `{}`.

- [ ] **Step 4: Replace vscode.workspace.getConfiguration usage**

Search for any remaining `vscode.` references. The original `dataSource.ts` uses `getConfig()` (from `./config`), which we've already replaced in Task 5. Verify `dataSource.ts` only imports from `./config`, `./logger`, `./types`, `./utils`, and standard Node modules.

- [ ] **Step 5: Fix iconv-lite import**

The original depends on `iconv-lite`. Add it:

```bash
cd /Users/farmahuang/git-graph-web && bun add iconv-lite
bun add --dev @types/iconv-lite  # if needed
```

- [ ] **Step 6: Fix child_process import**

Bun is compatible with Node's `child_process`. Ensure the import remains:
```typescript
import * as cp from 'child_process';
```

No change needed — Bun supports this.

- [ ] **Step 7: Verify TS compiles**

```bash
cd /Users/farmahuang/git-graph-web
bun x tsc -p server/tsconfig.json --noEmit
```

Expected: No errors (fix any remaining type errors from removed imports).

- [ ] **Step 8: Add 30-second timeout to git spawn calls**

The spec (section 9) requires a 30-second timeout for git commands. Search `server/dataSource.ts` for all `cp.spawn(` or `spawnSync(` calls and add `timeout: 30000` to the options object. For async spawn (EventEmitter pattern), add a `setTimeout` that calls `child.kill()` after 30 seconds and resolves with an ErrorInfo message.

Grep to find all spawn call sites:
```bash
grep -n "cp\.spawn\|child_process\.spawn" /Users/farmahuang/git-graph-web/server/dataSource.ts
```

For each call, ensure the timeout is applied before proceeding.

- [ ] **Step 9: Write a smoke test for dataSource**

Note: This test instantiates `DataSource` in isolation without needing `index.ts` or `repoManager.ts`. The git-graph-web repo itself has enough commits to test against.

Create `server/dataSource.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { DataSource } from './dataSource';
import { Logger } from './logger';

// Use the git-graph-web repo itself as the test repo (has at least Task 1 commits)
const TEST_REPO = '/Users/farmahuang/git-graph-web';

// Stub Event objects that DataSource constructor needs
const noopEvent = { event: (_: unknown) => () => {} } as any;

describe('DataSource', () => {
  function makeDataSource(): DataSource {
    const logger = new Logger('test');
    const gitPath = Bun.which('git');
    if (!gitPath) throw new Error('git not found in PATH');
    return new DataSource(
      { path: gitPath, version: { major: 2, minor: 0, patch: 0 } },
      noopEvent,
      noopEvent,
      logger
    );
  }

  test('getRepoInfo returns branches for a valid git repo', async () => {
    const ds = makeDataSource();
    const result = await ds.getRepoInfo(TEST_REPO, true, true, []);
    expect(result.error).toBeNull();
    expect(Array.isArray(result.branches)).toBe(true);
    expect(result.branches.length).toBeGreaterThan(0);
  });

  test('getCommits returns commits for a valid git repo', async () => {
    const ds = makeDataSource();
    // Signature must match the actual DataSource.getCommits method — check the ported file
    const result = await ds.getCommits(TEST_REPO, null, [], 50, false, false, false, false, 0, [], null);
    expect(result.error).toBeNull();
    expect(Array.isArray(result.commits)).toBe(true);
    expect(result.commits.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 10: Run tests**

```bash
cd /Users/farmahuang/git-graph-web
bun test server/dataSource.test.ts
```

Expected: Both tests PASS (the repo has at least one commit from the scaffold tasks).

- [ ] **Step 11: Commit**

```bash
cd /Users/farmahuang/git-graph-web
git add server/dataSource.ts server/dataSource.test.ts
bun add iconv-lite  # ensure package.json is updated
git add package.json bun.lockb
git commit -m "feat: port dataSource.ts - remove vscode/askpass deps, 30s timeout, keep git spawn logic"
```

---

## Chunk 3: Server Core — RepoManager, AvatarManager, FileWatcher, Server Entry

### File Map

| File | Action | Responsibility |
|---|---|---|
| `server/repoManager.ts` | Create | Port original repoManager, remove vscode.workspace, expose single-repo only |
| `server/avatarManager.ts` | Create | Port original avatarManager, store avatars in SQLite via ExtensionState |
| `server/repoFileWatcher.ts` | Create | Port original repoFileWatcher, use fs.watch instead of vscode.FileSystemWatcher |
| `server/index.ts` | Create | Bun HTTP + WebSocket server, message routing, startup validation |

---

### Task 8: Port repoManager.ts

**Files:**
- Create: `server/repoManager.ts`

- [ ] **Step 1: Copy repoManager.ts**

```bash
cp /tmp/vscode-git-graph-src/src/repoManager.ts /Users/farmahuang/git-graph-web/server/repoManager.ts
```

- [ ] **Step 2: Remove vscode.workspace.workspaceFolders dependency**

The original discovers repos from `vscode.workspace.workspaceFolders`. Replace with a function that takes the single repo path from environment/CLI:

```typescript
export function getRepoPath(): string {
  // Priority: env REPO_PATH > CLI arg --repo > cwd
  if (process.env.REPO_PATH) return process.env.REPO_PATH;
  const repoArg = process.argv.findIndex(a => a === '--repo');
  if (repoArg !== -1 && process.argv[repoArg + 1]) return process.argv[repoArg + 1];
  return process.cwd();
}
```

- [ ] **Step 3: Simplify to single-repo**

The original `RepoManager` discovers and tracks multiple repos. For v1:
- Keep the `getRepos()` method but have it return a single-entry map with the repo from `getRepoPath()`
- Remove `rescanForRepos`, `addRepo`, `removeRepo` multi-repo logic
- Keep `isKnownRepo()`, `getRepoState()`, `setRepoState()` intact

- [ ] **Step 4: Remove vscode imports and replace vscode API calls**

Remove `import * as vscode from 'vscode'`. Replace these specific APIs:

| Original | Replacement |
|---|---|
| `vscode.Uri.file(path)` | Use the path string directly |
| `vscode.workspace.fs.readFile(uri)` | `import { readFileSync } from 'fs'` → `readFileSync(path)` |
| `vscode.workspace.fs.writeFile(uri, data)` | `import { writeFileSync } from 'fs'` → `writeFileSync(path, data)` |
| `vscode.workspace.fs.stat(uri)` | `import { statSync, existsSync } from 'fs'` |
| `context.workspaceState.get/update` | Delegate to `ExtensionState.getWorkspaceViewState/setWorkspaceViewState` |

Also remove the `onDidChangeWorkspaceFolders` event listener entirely — it exists to trigger a repo rescan when the workspace changes, which is irrelevant for a single-repo server. Delete the listener registration and any code it calls.

- [ ] **Step 5: Verify TS compiles**

```bash
cd /Users/farmahuang/git-graph-web
bun x tsc -p server/tsconfig.json --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/farmahuang/git-graph-web
git add server/repoManager.ts
git commit -m "feat: port repoManager.ts - single repo, remove vscode.workspace"
```

---

### Task 9: Port avatarManager.ts

**Files:**
- Create: `server/avatarManager.ts`

- [ ] **Step 1: Copy avatarManager.ts**

```bash
cp /tmp/vscode-git-graph-src/src/avatarManager.ts /Users/farmahuang/git-graph-web/server/avatarManager.ts
```

- [ ] **Step 2: Remove vscode imports**

Remove `import * as vscode from 'vscode'`. The avatar manager makes HTTP requests to fetch avatars from Gravatar/GitHub. The original uses Node's `https` module — Bun is compatible with this.

- [ ] **Step 3: Replace avatar storage**

The original stores avatars on disk at `context.globalStoragePath + '/avatars/'`. Replace with `ExtensionState.saveAvatar()` / `getAvatar()` (SQLite-backed, defined in Task 6).

Update the `AvatarManager` constructor to accept an `ExtensionState` instead of a file path:

```typescript
constructor(
  extensionState: ExtensionState,
  onDidChangeConfiguration: Event<unknown>,
  gitExecutable: GitExecutable | null,
  logger: Logger
)
```

- [ ] **Step 4: Verify TS compiles**

```bash
cd /Users/farmahuang/git-graph-web
bun x tsc -p server/tsconfig.json --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/farmahuang/git-graph-web
git add server/avatarManager.ts
git commit -m "feat: port avatarManager.ts - SQLite avatar storage"
```

---

### Task 10: Port repoFileWatcher.ts

**Files:**
- Create: `server/repoFileWatcher.ts`

The original uses `vscode.workspace.createFileSystemWatcher`. Replace with Node's `fs.watch`.

- [ ] **Step 1: Create `server/repoFileWatcher.ts` from scratch**

The original watcher pattern is: watch `.git/` paths, debounce, call callback. Rewrite using `fs.watch`.

The callback type is `() => void` — called with no arguments when a relevant `.git/` file changes. `server/index.ts` wires this callback to broadcast `{ command: 'refresh' }` to all WebSocket clients.

```typescript
import { watch, FSWatcher } from 'fs';
import { join } from 'path';

const WATCH_PATHS = ['HEAD', 'refs', 'packed-refs', 'stash'];
const DEBOUNCE_MS = 500;

export class RepoFileWatcher {
  private readonly repoPath: string;
  private readonly onChange: () => void;
  private watchers: FSWatcher[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private muted: boolean = false;

  constructor(repoPath: string, onChange: () => void) {
    this.repoPath = repoPath;
    this.onChange = onChange;
  }

  start(): void {
    const gitDir = join(this.repoPath, '.git');
    for (const rel of WATCH_PATHS) {
      try {
        const watcher = watch(join(gitDir, rel), { recursive: true }, () => {
          if (!this.muted) this.scheduleRefresh();
        });
        this.watchers.push(watcher);
      } catch {
        // Path may not exist (e.g. no stash file) — ignore
      }
    }
  }

  mute(): void { this.muted = true; }
  unmute(): void { this.muted = false; }

  stop(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    for (const w of this.watchers) w.close();
    this.watchers = [];
  }

  private scheduleRefresh(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.onChange();
    }, DEBOUNCE_MS);
  }
}
```

Write to `/Users/farmahuang/git-graph-web/server/repoFileWatcher.ts`.

- [ ] **Step 2: Write a test**

Create `server/repoFileWatcher.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { RepoFileWatcher } from './repoFileWatcher';
import { writeFileSync } from 'fs';
import { join } from 'path';

describe('RepoFileWatcher', () => {
  test('calls onChange when .git/HEAD changes', async () => {
    const repoPath = '/Users/farmahuang/git-graph-web';
    let called = false;
    const watcher = new RepoFileWatcher(repoPath, () => { called = true; });

    watcher.start();
    // Touch HEAD to trigger watcher
    const headPath = join(repoPath, '.git', 'HEAD');
    const original = Bun.file(headPath);
    const content = await original.text();
    writeFileSync(headPath, content); // write same content to trigger change

    await Bun.sleep(800); // wait for debounce
    watcher.stop();

    expect(called).toBe(true);
  });

  test('does not call onChange when muted', async () => {
    const repoPath = '/Users/farmahuang/git-graph-web';
    let called = false;
    const watcher = new RepoFileWatcher(repoPath, () => { called = true; });

    watcher.start();
    watcher.mute();
    writeFileSync(join(repoPath, '.git', 'HEAD'), (await Bun.file(join(repoPath, '.git', 'HEAD')).text()));
    await Bun.sleep(800);
    watcher.stop();

    expect(called).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/farmahuang/git-graph-web
bun test server/repoFileWatcher.test.ts
```

Expected: Both tests PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/farmahuang/git-graph-web
git add server/repoFileWatcher.ts server/repoFileWatcher.test.ts
git commit -m "feat: add RepoFileWatcher using fs.watch with 500ms debounce"
```

---

### Task 11: Create server/index.ts — Bun HTTP + WebSocket entry

**Files:**
- Create: `server/index.ts`

This is the main Bun server. Handles:
1. Startup validation (git in PATH, repo path is valid git repo)
2. HTTP: serve static files (production), `/avatars/:hash`, `/diff`
3. WebSocket: route `RequestMessage` to handlers, send `ResponseMessage` back with `requestId`
4. File watcher push: send `{ command: 'refresh' }` to all connected clients

- [ ] **Step 1: Create `server/index.ts`**

```typescript
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { Logger } from './logger';
import { DataSource } from './dataSource';
import { ExtensionState } from './extensionState';
import { RepoManager, getRepoPath } from './repoManager';
import { AvatarManager } from './avatarManager';
import { RepoFileWatcher } from './repoFileWatcher';
import { getConfig } from './config';
import type { RequestMessage, ResponseMessage } from './types';

const PORT = Number(process.env.PORT ?? 3000);
const logger = new Logger();

// --- Startup validation ---

function findGit(): string {
  const git = Bun.which('git');
  if (!git) {
    logger.logError('git not found in PATH. Install git and try again.');
    process.exit(1);
  }
  return git;
}

function validateRepo(repoPath: string): void {
  const result = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: repoPath });
  if (result.status !== 0) {
    logger.logError(`"${repoPath}" is not a git repository.`);
    process.exit(1);
  }
}

const gitPath = findGit();
const repoPath = getRepoPath();
validateRepo(repoPath);
logger.log(`Serving repo: ${repoPath}`);

// --- Dependencies ---

const extensionState = new ExtensionState();
const config = getConfig();
const dataSource = new DataSource(
  { path: gitPath, version: { major: 2, minor: 0, patch: 0 } },
  // onDidChangeConfiguration / onDidChangeGitExecutable stubs:
  { event: (_: unknown) => () => {} } as any,
  { event: (_: unknown) => () => {} } as any,
  logger
);
const repoManager = new RepoManager(repoPath, dataSource, extensionState, logger);
const avatarManager = new AvatarManager(extensionState, { event: (_: unknown) => () => {} } as any, { path: gitPath, version: { major: 2, minor: 0, patch: 0 } }, logger);

// --- WebSocket clients ---

const clients = new Set<ServerWebSocket<unknown>>();

function broadcast(msg: object): void {
  const json = JSON.stringify(msg);
  for (const ws of clients) ws.send(json);
}

// --- File watcher ---

const fileWatcher = new RepoFileWatcher(repoPath, () => {
  broadcast({ command: 'refresh' });
});
fileWatcher.start();

// --- Message router ---

async function handleMessage(ws: ServerWebSocket<unknown>, raw: string): Promise<void> {
  let msg: RequestMessage & { requestId?: string };
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  const { requestId } = msg;
  fileWatcher.mute();

  try {
    const response = await routeMessage(msg);
    if (response !== null) {
      ws.send(JSON.stringify({ ...response, requestId }));
    }
  } catch (e) {
    ws.send(JSON.stringify({ command: msg.command, error: String(e), requestId }));
  } finally {
    fileWatcher.unmute();
  }
}

async function routeMessage(msg: RequestMessage): Promise<ResponseMessage | null> {
  switch (msg.command) {
    case 'loadRepos':
      return { command: 'loadRepos', repos: repoManager.getRepos(), loading: false, error: null };
    case 'loadRepoInfo':
      // delegate to dataSource.getRepoInfo
      // ... (implement each case similarly)
      return null;
    // ... all other cases from gitGraphView.ts respondToMessage
    default:
      logger.logError(`Unknown command: ${(msg as any).command}`);
      return null;
  }
}

// --- HTTP + WebSocket server ---

const DIST_DIR = join(import.meta.dir, '..', 'dist');

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === '/ws') {
      const success = server.upgrade(req);
      if (!success) return new Response('WebSocket upgrade failed', { status: 400 });
      return undefined as unknown as Response;
    }

    // Avatar images
    if (url.pathname.startsWith('/avatars/')) {
      const email = decodeURIComponent(url.pathname.slice('/avatars/'.length));
      const img = extensionState.getAvatar(email);
      if (!img) return new Response(null, { status: 404 });
      return new Response(img, { headers: { 'Content-Type': 'image/png' } });
    }

    // Diff endpoint
    if (url.pathname === '/diff') {
      const { repo, fromHash, toHash, oldFilePath, newFilePath, type } = Object.fromEntries(url.searchParams);
      // Run git diff and return as text
      const result = spawnSync('git', [
        'diff', `${fromHash}..${toHash}`, '--', oldFilePath, newFilePath
      ], { cwd: repo ?? repoPath, encoding: 'utf8', timeout: 30000 });
      return new Response(result.stdout || result.stderr || '(no diff)', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    // Static files (production)
    const filePath = join(DIST_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
    if (existsSync(filePath)) {
      return new Response(Bun.file(filePath));
    }

    return new Response('Not found', { status: 404 });
  },

  websocket: {
    open(ws) { clients.add(ws); logger.log('Client connected'); },
    close(ws) { clients.delete(ws); logger.log('Client disconnected'); },
    message(ws, data) { handleMessage(ws, String(data)); },
  },

  error(err) {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      logger.logError(`Port ${PORT} is already in use. Set PORT env var to use a different port.`);
      process.exit(1);
    }
    return new Response('Internal server error', { status: 500 });
  }
});

logger.log(`Server running at http://localhost:${PORT}`);
```

Write to `/Users/farmahuang/git-graph-web/server/index.ts`.

- [ ] **Step 2: Implement `routeMessage` — port all cases from gitGraphView.ts**

**Source reference:** `/tmp/vscode-git-graph-src/src/gitGraphView.ts`, method `respondToMessage`.

Read that file and implement one `case` at a time. Each case calls a `dataSource` method, then returns the response object. Template:

```typescript
case 'loadCommits': {
  const result = await dataSource.getCommits(
    msg.repo, msg.branches, msg.maxCommits, msg.showRemoteBranches,
    msg.showTags, msg.includeCommitsMentionedByReflogs,
    msg.onlyFollowFirstParent, msg.filterDetails, msg.remotes, msg.hideRemotes
  );
  return { command: 'loadCommits', ...result };
}
```

**Complete checklist of commands to implement** (from `respondToMessage` in the source):
- [ ] `loadRepos` — return `repoManager.getRepos()`
- [ ] `loadRepoInfo` — `dataSource.getRepoInfo(...)`
- [ ] `loadCommits` — `dataSource.getCommits(...)`
- [ ] `loadConfig` — `dataSource.getConfig(...)`
- [ ] `checkoutBranch` — `dataSource.checkoutBranch(...)`
- [ ] `checkoutCommit` — `dataSource.checkoutCommit(...)`
- [ ] `createBranch` — `dataSource.createBranch(...)`
- [ ] `deleteBranch` — `dataSource.deleteBranch(...)`
- [ ] `renameBranch` — `dataSource.renameBranch(...)`
- [ ] `addTag` — `dataSource.addTag(...)`
- [ ] `deleteTag` — `dataSource.deleteTag(...)`
- [ ] `pushTag` — `dataSource.pushTag(...)`
- [ ] `tagDetails` — `dataSource.getTagDetails(...)`
- [ ] `fetch` — `dataSource.fetch(...)`
- [ ] `pushBranch` — `dataSource.pushBranch(...)`
- [ ] `pullBranch` — `dataSource.pullBranch(...)`
- [ ] `fetchIntoLocalBranch` — `dataSource.fetchIntoLocalBranch(...)`
- [ ] `merge` — `dataSource.merge(...)`
- [ ] `rebase` — `dataSource.rebase(...)`
- [ ] `cherrypickCommit` — `dataSource.cherrypick(...)`
- [ ] `revertCommit` — `dataSource.revert(...)`
- [ ] `dropCommit` — `dataSource.dropCommit(...)`
- [ ] `resetToCommit` — `dataSource.resetToCommit(...)`
- [ ] `resetFileToRevision` — `dataSource.resetFileToRevision(...)`
- [ ] `createArchive` — `dataSource.archive(...)`
- [ ] `applyStash` — `dataSource.applyStash(...)`
- [ ] `popStash` — `dataSource.popStash(...)`
- [ ] `dropStash` — `dataSource.dropStash(...)`
- [ ] `pushStash` — `dataSource.pushStash(...)`
- [ ] `branchFromStash` — `dataSource.branchFromStash(...)`
- [ ] `addRemote` — `dataSource.addRemote(...)`
- [ ] `editRemote` — `dataSource.editRemote(...)`
- [ ] `deleteRemote` — `dataSource.deleteRemote(...)`
- [ ] `pruneRemote` — `dataSource.pruneRemote(...)`
- [ ] `commitDetails` — `dataSource.getCommitDetails(...)`
- [ ] `compareCommits` — `dataSource.getCommitComparison(...)`
- [ ] `startCodeReview` — `extensionState.saveCodeReview(...)`
- [ ] `endCodeReview` — `extensionState.endCodeReview(...)`
- [ ] `updateCodeReview` — `extensionState.updateCodeReview(...)`
- [ ] `setRepoState` — `extensionState.setRepoState(...)`
- [ ] `setGlobalViewState` — `extensionState.setGlobalViewState(...)`
- [ ] `setWorkspaceViewState` — `extensionState.setWorkspaceViewState(...)`
- [ ] `fetchAvatar` — `avatarManager.fetchAvatar(...)`
- [ ] `exportRepoConfig` — `dataSource.getRepoConfig(...)`
- [ ] `deleteUserDetails` — `dataSource.deleteConfig(...)`
- [ ] `editUserDetails` — `dataSource.setConfig(...)`
- [ ] `rescanForRepos` — return `{ command: 'loadRepos', repos: repoManager.getRepos(), loading: false, error: null }` (single-repo, same as loadRepos)
- [ ] `showErrorMessage` — return `null` (frontend shows the error itself)
- [ ] `openExternalDirDiff` — return `null` (browser-incompatible, no external diff tool)
- [ ] `openTerminal` — return `null` (browser-incompatible)
- [ ] `openExtensionSettings` — return `null` (browser-incompatible)
- [ ] `viewScm` — return `null` (browser-incompatible)
- [ ] `openFile` — return `null` (browser cannot open local files)
- [ ] `viewFileAtRevision` — return `null` (browser-incompatible)
- [ ] `createPullRequest` — return `null` (opens browser URL — frontend can handle via window.open if needed)
- [ ] `copyFilePath` — return `{ command: 'copyFilePath', success: true }` (frontend handles via navigator.clipboard; server sends ack so frontend knows to proceed)
- [ ] `copyToClipboard` — return `{ command: 'copyToClipboard', success: true }` (same pattern)
- [ ] `openExternalUrl` — return `{ command: 'openExternalUrl', url: msg.url }` (frontend calls window.open on this URL)
- [ ] `viewDiff` — return `{ command: 'viewDiff', url: buildDiffUrl(msg) }` where `buildDiffUrl` constructs `/diff?repo=...&fromHash=...&toHash=...&oldFilePath=...&newFilePath=...&type=...`; frontend calls `window.open(url)`
- [ ] `viewDiffWithWorkingFile` — same as `viewDiff`, set `toHash` to working-file sentinel

**IMPORTANT:** Every `return` statement must include `requestId` from the outer `handleMessage` wrapper (already applied by the `{ ...response, requestId }` spread in `handleMessage`). You do not need to add it per-case — the wrapper handles it.

After implementing all cases, verify the checklist is complete by running:
```bash
grep "case '" /tmp/vscode-git-graph-src/src/gitGraphView.ts | wc -l
# Compare to your implementation
grep "case '" /Users/farmahuang/git-graph-web/server/index.ts | wc -l
```
Counts should match.

- [ ] **Step 3: Verify TS compiles**

```bash
cd /Users/farmahuang/git-graph-web
bun x tsc -p server/tsconfig.json --noEmit
```

Expected: No errors.

- [ ] **Step 4: Smoke test — start the server**

```bash
cd /Users/farmahuang/git-graph-web
REPO_PATH=/Users/farmahuang/git-graph-web bun run server/index.ts &
SERVER_PID=$!
sleep 1

# Should return 404 (no dist/ yet) or HTML if dist/ exists
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/

# Get actual HEAD and HEAD~1 hashes for diff test
HEAD=$(git -C /Users/farmahuang/git-graph-web rev-parse HEAD)
PREV=$(git -C /Users/farmahuang/git-graph-web rev-parse HEAD~1)

# Diff endpoint — should return text diff content
curl -s "http://localhost:3000/diff?repo=%2FUsers%2Ffarmahuang%2Fgit-graph-web&fromHash=${PREV}&toHash=${HEAD}&oldFilePath=package.json&newFilePath=package.json&type=M" | head -10

kill $SERVER_PID
```

Expected: First curl returns 404 or 200. Second curl returns diff text (starts with `diff --git` or `(no diff)`), not a connection error.

- [ ] **Step 5: Commit**

```bash
cd /Users/farmahuang/git-graph-web
git add server/index.ts
git commit -m "feat: add Bun HTTP + WebSocket server with message routing"
```

---

## Chunk 4: Frontend — Web Files + Vite Config

### File Map

| File | Action | Responsibility |
|---|---|---|
| `web/vscodeApi.ts` | Create | acquireVsCodeApi() shim — WebSocket transport, reconnect, requestId, localStorage state |
| `web/main.ts` | Modify | Change one import: replace acquireVsCodeApi() call with shim import |
| `web/graph.ts` | Copy | No changes |
| `web/dialog.ts` | Copy | No changes |
| `web/contextMenu.ts` | Copy | No changes |
| `web/dropdown.ts` | Copy | No changes |
| `web/findWidget.ts` | Copy | No changes |
| `web/settingsWidget.ts` | Copy | No changes |
| `web/textFormatter.ts` | Copy | No changes |
| `web/utils.ts` | Copy, minor edits | Remove vscode-specific utils (openGitTerminal, viewScm, openFile), keep rest |
| `web/global.d.ts` | Copy | No changes |
| `web/styles/` | Copy | No changes |
| `index.html` | Create | Entry HTML for Vite |
| `vite.config.ts` | Create | Vite config with WebSocket proxy |

---

### Task 12: Copy web source files

**Files:**
- Copy all web/ source files from upstream

- [ ] **Step 1: Verify source path exists, then copy all web files**

```bash
# Verify source is available (re-clone if needed — see Task 1 Step 3)
ls /tmp/vscode-git-graph-src/web/main.ts

# Copy TypeScript source files
cp /tmp/vscode-git-graph-src/web/*.ts /Users/farmahuang/git-graph-web/web/
cp /tmp/vscode-git-graph-src/web/*.d.ts /Users/farmahuang/git-graph-web/web/ 2>/dev/null || true

# Copy styles from the upstream source (not from project root)
cp -r /tmp/vscode-git-graph-src/web/styles /Users/farmahuang/git-graph-web/web/
```

- [ ] **Step 2: Verify files copied**

```bash
ls /Users/farmahuang/git-graph-web/web/
```

Expected: `main.ts`, `graph.ts`, `dialog.ts`, `contextMenu.ts`, `dropdown.ts`, `findWidget.ts`, `settingsWidget.ts`, `textFormatter.ts`, `utils.ts`, `global.d.ts`, `styles/`, `tsconfig.json`.

- [ ] **Step 3: Commit**

```bash
cd /Users/farmahuang/git-graph-web
git add web/
git commit -m "chore: copy original web/ source files from vscode-git-graph"
```

---

### Task 13: Create vscodeApi.ts shim

**Files:**
- Create: `web/vscodeApi.ts`

- [ ] **Step 1: Create `web/vscodeApi.ts`**

```typescript
// web/vscodeApi.ts
// Replaces acquireVsCodeApi() for browser environment.
// Routes messages over WebSocket instead of VSCode postMessage.

import { nanoid } from 'nanoid';
import type { RequestMessage, ResponseMessage, WebViewState } from '../server/types';

type VsCodeApi = {
  postMessage(msg: RequestMessage): void;
  getState(): WebViewState | null;
  setState(state: WebViewState): void;
};

const WS_URL = `ws://${location.host}/ws`;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]; // 5 attempts
const STATE_KEY = 'git-graph-web-state';

let ws: WebSocket;
let reconnectAttempt = 0;
const pendingRequests = new Map<string, (error: string | null) => void>();

function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    reconnectAttempt = 0;
    console.log('[git-graph-web] WebSocket connected');
  };

  ws.onclose = () => {
    // Fail all pending requests BEFORE scheduling reconnect,
    // so no request can be re-sent after reconnection (avoids duplicate mutations)
    for (const [id, reject] of pendingRequests) {
      reject('WebSocket disconnected');
      pendingRequests.delete(id);
    }

    if (reconnectAttempt < RECONNECT_DELAYS.length) {
      const delay = RECONNECT_DELAYS[reconnectAttempt++];
      console.log(`[git-graph-web] Reconnecting in ${delay}ms (attempt ${reconnectAttempt})`);
      setTimeout(connect, delay);
    } else {
      console.error('[git-graph-web] Max reconnection attempts reached');
    }
  };

  ws.onmessage = (event) => {
    let data: ResponseMessage & { requestId?: string };
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    // Resolve pending request if present
    if (data.requestId) {
      const resolve = pendingRequests.get(data.requestId);
      if (resolve) {
        pendingRequests.delete(data.requestId);
        resolve(null);
      }
    }

    // Dispatch to original event listener (window.addEventListener('message', ...))
    window.dispatchEvent(new MessageEvent('message', { data }));
  };
}

connect();

export function acquireVsCodeApi(): VsCodeApi {
  return {
    postMessage(msg: RequestMessage): void {
      const requestId = nanoid();
      // Track pending request (optional: resolve when response arrives)
      pendingRequests.set(requestId, () => {});
      ws.send(JSON.stringify({ ...msg, requestId }));
    },
    getState(): WebViewState | null {
      const raw = localStorage.getItem(STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    },
    setState(state: WebViewState): void {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    },
  };
}
```

Write to `/Users/farmahuang/git-graph-web/web/vscodeApi.ts`.

- [ ] **Step 2: Commit**

```bash
cd /Users/farmahuang/git-graph-web
git add web/vscodeApi.ts
git commit -m "feat: add vscodeApi.ts shim - WebSocket transport with reconnect and requestId"
```

---

### Task 14: Patch web/main.ts and web/utils.ts

**Files:**
- Modify: `web/main.ts`
- Modify: `web/utils.ts`

- [ ] **Step 1: Find acquireVsCodeApi() call in web/main.ts**

```bash
grep -n "acquireVsCodeApi" /Users/farmahuang/git-graph-web/web/main.ts
```

Note the line number.

- [ ] **Step 2: Replace acquireVsCodeApi() in web/main.ts**

Find the line like:
```typescript
const vscode = acquireVsCodeApi();
```

Add an import at the top of the file:
```typescript
import { acquireVsCodeApi } from './vscodeApi';
```

And remove any existing `declare function acquireVsCodeApi()` or `const { acquireVsCodeApi } = window as any` patterns.

- [ ] **Step 3: Find and handle browser-incompatible utils in web/utils.ts**

```bash
grep -n "openGitTerminal\|viewScm\|openFile\|openExtensionSettings" /Users/farmahuang/git-graph-web/web/utils.ts
```

For each function that calls `vscode.postMessage` with a browser-incompatible command, verify it is only called from UI buttons that we will hide. If the function itself is defined in `utils.ts`, leave it in place — the button hiding will be done via CSS (`display: none`) in a later step, so the dead code path is acceptable.

- [ ] **Step 4: Check ALL web/ files for stray `acquireVsCodeApi` declarations**

```bash
grep -rn "acquireVsCodeApi\|declare function acquireVsCodeApi" /Users/farmahuang/git-graph-web/web/
```

Expected: Only the import in `main.ts` and the export in `vscodeApi.ts`. If any other file has a `declare function acquireVsCodeApi()`, remove that declaration from that file — the shim import in `main.ts` is the only source of truth.

- [ ] **Step 5: Verify web TS compiles**

```bash
cd /Users/farmahuang/git-graph-web
bun x tsc -p web/tsconfig.json --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/farmahuang/git-graph-web
git add web/main.ts web/utils.ts
git commit -m "feat: patch web/main.ts to use vscodeApi.ts shim"
```

---

### Task 15: Create index.html and vite.config.ts

**Files:**
- Create: `index.html`
- Create: `vite.config.ts`

- [ ] **Step 1: Create `index.html`**

Look at how the original extension generates its webview HTML. Read the `getHtmlForWebview` method in the **extension source** (not the copied web/ files):

```bash
grep -A 60 "getHtmlForWebview" /tmp/vscode-git-graph-src/src/gitGraphView.ts | head -80
```

Replicate the HTML structure (CSP removed, script tag pointing to Vite entry):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Git Graph</title>
</head>
<body>
  <div id="app">
    <div id="scrollShadow"></div>
    <div id="controls">
      <div id="repoControl">
        <div id="repoLabel">Repo: </div>
        <div id="repoDropdown"></div>
      </div>
      <div id="branchControl">
        <div id="branchLabel">Branch: </div>
        <div id="branchDropdown"></div>
      </div>
      <label id="showRemoteBranchesControl">
        <input id="showRemoteBranchesCheckbox" type="checkbox">
        Show Remote Branches
      </label>
      <div id="refreshBtn" title="Refresh"></div>
      <div id="findBtn" title="Find"></div>
      <div id="settingsBtn" title="Repository Settings"></div>
    </div>
    <div id="commitGraph"></div>
    <div id="commitTable"></div>
    <div id="footer">
      <div id="footerTableInfo"></div>
      <div id="footerBranchInfo"></div>
    </div>
  </div>
  <script type="module" src="/web/main.ts"></script>
</body>
</html>
```

Verify the exact element IDs by checking `web/main.ts`'s `document.getElementById` calls:

```bash
grep -o "getElementById('[^']*')" /Users/farmahuang/git-graph-web/web/main.ts | sort -u
```

Every ID returned must have a matching element in `index.html`. Common required IDs include: `scrollShadow`, `controls`, `repoDropdown`, `branchDropdown`, `showRemoteBranchesCheckbox`, `refreshBtn`, `findBtn`, `settingsBtn`, `commitGraph`, `commitTable`, `footer`, `footerTableInfo`, `footerBranchInfo`. Confirm the exact list from the grep above.

- [ ] **Step 2: Create `vite.config.ts`**

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: Number(process.env.VITE_PORT ?? 5173),
    proxy: {
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
      '/avatars': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/diff': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
    },
  },
});
```

Write to `/Users/farmahuang/git-graph-web/vite.config.ts`.

- [ ] **Step 3: Commit**

```bash
cd /Users/farmahuang/git-graph-web
git add index.html vite.config.ts
git commit -m "feat: add index.html and vite.config.ts"
```

---

## Chunk 5: Integration, E2E Smoke Test, CSS Fixes, Production Build

### File Map

| File | Action | Responsibility |
|---|---|---|
| `web/styles/main.css` | Modify | Hide browser-incompatible buttons (openTerminal, viewScm, openExtensionSettings) |
| `package.json` | Modify | Finalize dev/build/start scripts with concurrently |
| `server/index.ts` | Modify | Fix any issues found during E2E testing |

---

### Task 16: E2E smoke test — dev mode

- [ ] **Step 1: Start both servers**

```bash
cd /Users/farmahuang/git-graph-web
REPO_PATH=/Users/farmahuang/git-graph-web bun run server/index.ts &
SERVER_PID=$!
sleep 1
bun x vite &
VITE_PID=$!
sleep 3
echo "Servers started. Open http://localhost:5173 in browser."
```

- [ ] **Step 2: Headless verification — HTML served and WebSocket endpoint available**

```bash
# Verify Vite serves HTML with expected root element
curl -s http://localhost:5173/ | grep -c 'id="app"'
# Expected: 1

# Verify Bun server WebSocket endpoint responds (returns 400 for non-WS upgrade, not connection refused)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ws
# Expected: 400
```

If either check fails, inspect server logs and fix the underlying error before proceeding.

Then open `http://localhost:5173` in a browser and verify manually:
- [ ] Git graph renders commits (should show at least the commits from scaffold tasks)
- [ ] Branch dropdown shows current branch
- [ ] Commit rows are clickable and show commit details panel
- [ ] No JS console errors

If browser errors appear: check browser console and Bun server logs. Fix the underlying issue — do not suppress errors.

- [ ] **Step 3: Test WebSocket reconnection**

With the browser open:
1. Kill the Bun server: `kill $SERVER_PID`
2. Wait 2 seconds — verify browser shows a reconnecting indicator or degrades gracefully (no crash)
3. Restart: `REPO_PATH=/Users/farmahuang/git-graph-web bun run server/index.ts &`
4. Verify the graph reloads automatically after reconnection

- [ ] **Step 4: Test file watcher**

With the browser open and graph visible:
1. Create a test commit: `cd /tmp && git init testrepo && cd testrepo && echo "test" > f.txt && git add . && git commit -m "test"`
2. Switch the server to watch a real active repo (or just make a commit in git-graph-web)
3. Verify the graph updates within ~1 second of the commit

- [ ] **Step 5: Stop servers and commit any fixes**

```bash
kill $SERVER_PID $VITE_PID 2>/dev/null
cd /Users/farmahuang/git-graph-web
git add -A
git commit -m "fix: E2E smoke test fixes"
```

---

### Task 17: Hide browser-incompatible buttons

**Files:**
- Modify: `web/styles/main.css` (or whichever CSS file contains button styles)

- [ ] **Step 1: Identify button element IDs for removed commands**

Note: The spec uses terms `openGitTerminal`, `viewScm`, and `openExtensionSettings`. Search for all three:

```bash
grep -n "openGitTerminal\|openTerminal\|viewScm\|openExtensionSettings" /Users/farmahuang/git-graph-web/web/main.ts | head -20
```

Note the element IDs or classes used.

- [ ] **Step 2: Add CSS to hide buttons**

In `web/styles/main.css`, add at the end:

```css
/* Browser-incompatible VSCode commands — hidden in web version */
#openTerminalBtn,
#viewScmBtn,
#openExtensionSettingsBtn {
  display: none !important;
}
```

Adjust selectors to match actual IDs from step 1.

- [ ] **Step 3: Verify buttons are gone**

Reload `http://localhost:5173` and confirm the removed buttons no longer appear in the UI.

- [ ] **Step 4: Commit**

```bash
cd /Users/farmahuang/git-graph-web
git add web/styles/
git commit -m "fix: hide browser-incompatible buttons (terminal, scm, extension settings)"
```

---

### Task 18: Production build

**Files:**
- Modify: `server/index.ts` (ensure static file serving works)

- [ ] **Step 1: Build frontend**

```bash
cd /Users/farmahuang/git-graph-web
bun run build
```

Expected: `dist/` directory created with `index.html` and assets.

- [ ] **Step 2: Start server in production mode**

```bash
cd /Users/farmahuang/git-graph-web
REPO_PATH=/Users/farmahuang/git-graph-web bun run server/index.ts &
SERVER_PID=$!
sleep 1

# Verify HTML with expected root element is served (not a 404 page)
curl -s http://localhost:3000/ | grep -c 'id="app"'
```

Expected: Returns `1` (the `<div id="app">` from `index.html` is present in the response).

- [ ] **Step 3: Open production build in browser**

Open `http://localhost:3000` (not :5173). Verify the same functionality as dev mode:
- [ ] Git graph renders
- [ ] Commits are clickable
- [ ] No console errors

- [ ] **Step 4: Kill server and commit**

```bash
kill $SERVER_PID
cd /Users/farmahuang/git-graph-web
git add dist/ -f  # if committing dist; or add to .gitignore
git commit -m "feat: production build verified"
```

Note: Usually `dist/` is gitignored. Add a comment in README about running `bun run build` first.

---

### Task 19: Final test run and cleanup

- [ ] **Step 1: Run all tests**

```bash
cd /Users/farmahuang/git-graph-web
bun test
```

Expected: All tests PASS with exit code 0. Tests written in Tasks 6, 7, and 10 should be discovered and run automatically. If `bun test` reports "no test files found", verify those test files exist and are named `*.test.ts`.

- [ ] **Step 2: Run TypeScript check across entire project**

```bash
cd /Users/farmahuang/git-graph-web
bun x tsc -p server/tsconfig.json --noEmit
bun x tsc -p web/tsconfig.json --noEmit
```

Expected: No errors.

- [ ] **Step 3: Verify `bun run dev` script works end-to-end**

```bash
cd /Users/farmahuang/git-graph-web
REPO_PATH=/Users/farmahuang/git-graph-web bun run dev &
DEV_PID=$!
sleep 4
curl -s http://localhost:5173/ | grep -c "<html"
kill $DEV_PID
```

Expected: Returns `1`.

- [ ] **Step 4: Final commit**

```bash
cd /Users/farmahuang/git-graph-web
git add -A
git commit -m "chore: final cleanup, all tests passing"
```

---

## Summary

| Chunk | Tasks | Key Output |
|---|---|---|
| 1: Scaffold + Types | 1–4 | Project structure, ported types, utils |
| 2: Server Core | 5–7 | config.ts, extensionState.ts (SQLite), dataSource.ts |
| 3: Server Entry | 8–11 | repoManager, avatarManager, fileWatcher, HTTP+WS server |
| 4: Frontend | 12–15 | web/ files, vscodeApi.ts shim, index.html, vite.config.ts |
| 5: Integration | 16–19 | E2E smoke test, production build, all tests green |
