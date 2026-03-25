# git-graph-web

A standalone web application that brings the [Git Graph VSCode extension](https://github.com/mhutchie/vscode-git-graph) experience to the browser. It re-uses the original extension's frontend and git logic, served by a lightweight Bun HTTP + WebSocket server.

## Requirements

- [Bun](https://bun.sh) >= 1.0
- Git installed and available in `PATH`
- (Optional) [difftastic](https://difftastic.wilsonl.in/) installed and available in `PATH` for syntax-aware inline subword diffs.

## Setup

```bash
bun install
```

## Development

```bash
bun run dev
```

Starts the Bun server (with watch mode) and Vite dev server concurrently. Open http://localhost:3000 in your browser.

By default the server uses the current working directory as the repository to inspect. Set `GIT_GRAPH_WEB_REPO_PATH` to override:

```bash
GIT_GRAPH_WEB_REPO_PATH=/path/to/repo bun run dev
```

## Production Build

```bash
bun run build   # bundles the frontend into web/dist/
bun run start   # serves web/dist/ + API on port 3000
```

Set `PORT` to change the listening port:

```bash
PORT=8080 bun run start
```

## Architecture

| Layer | Technology | Notes |
|-------|-----------|-------|
| Server | Bun (`bun serve`) | HTTP + native WebSocket |
| Frontend | TypeScript + Vite | Ported from the VSCode webview |
| Git operations | Ported `DataSource` | Shells out to `git` |
| State | `RepoManager`, `ExtensionState` | Ported from VSCode extension |
| Live reload | `RepoFileWatcher` | Watches `.git/` for changes |

### Key endpoints

- `GET /` — serves the built frontend (`web/dist/index.html`)
- `GET /api/initial-state` — returns the `GitGraphViewInitialState` JSON consumed by the frontend on boot
- `WebSocket /` — bidirectional message channel for git operations and push-based refresh

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GIT_GRAPH_WEB_REPO_PATH` | `process.cwd()` | Repository path to visualise |
| `PORT` | `3000` | HTTP/WebSocket listen port |

## Tests

```bash
bun test
```

## Acknowledgements

This project was inspired by, and reuses significant portions of the frontend webview code and git core logic from the excellent [VSCode Git Graph](https://github.com/mhutchie/vscode-git-graph) extension created by Michael Hutchison. Thank you for building such an incredible open-source tool!
