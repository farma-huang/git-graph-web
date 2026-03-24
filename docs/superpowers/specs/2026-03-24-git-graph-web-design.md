# git-graph-web 設計文件

**日期**：2026-03-24
**狀態**：已核准
**來源**：vscode-git-graph develop branch（https://github.com/mhutchie/vscode-git-graph/tree/develop）

---

## 目標

將 vscode-git-graph VSCode 擴充套件移植為可在瀏覽器中獨立執行的本機 web 應用程式，支援完整 git 操作功能，後端使用 Bun，前端保留原版架構並改用 Vite 打包。

---

## 技術棧

| 層 | 技術 |
|---|---|
| 後端執行時 | Bun |
| 後端通訊 | Bun 原生 HTTP + WebSocket |
| 前端打包 / dev server | Vite |
| 前端語言 | TypeScript（原版 vanilla TS，無框架） |
| 狀態持久化 | Bun SQLite |
| Git 執行 | `child_process.spawn`（Bun 相容）→ git CLI |

---

## 架構

### 執行期元件

```
Browser (Vite :5173)
    │
    │  WebSocket ws://localhost:3000/ws
    │  (Vite proxy 轉發)
    ▼
Bun Server (:3000)
    │
    │  spawn git
    ▼
Git CLI（本機 repo）
```

- **Vite Dev Server**（port 5173）：提供前端 HMR，proxy `/ws` 到 Bun server
- **Bun Server**（port 3000）：處理 WebSocket 訊息、執行 git 指令、監聽檔案系統變更並主動推送 refresh
- **Git CLI**：Bun 透過 `spawn` 執行，與原版 `dataSource.ts` 邏輯相同

### Production 模式

Vite build 產生靜態檔，由 Bun server 直接 serve，單一 process 執行。

---

## 專案結構

```
git-graph-web/
├── server/
│   ├── index.ts           ← Bun HTTP + WebSocket 入口，處理訊息路由
│   ├── dataSource.ts      ← 移植原版，移除 vscode.* 依賴
│   ├── repoManager.ts     ← 移植原版
│   ├── avatarManager.ts   ← 移植原版
│   ├── extensionState.ts  ← 改用 Bun SQLite
│   ├── config.ts          ← 移植原版設定邏輯
│   ├── types.ts           ← 共用型別（原版）
│   └── utils/             ← 移植原版工具函式
├── web/                   ← 幾乎原版不動
│   ├── vscodeApi.ts       ← 新增：acquireVsCodeApi() shim
│   ├── main.ts            ← 只改一行 import
│   ├── graph.ts
│   ├── dialog.ts
│   ├── contextMenu.ts
│   ├── dropdown.ts
│   ├── findWidget.ts
│   ├── settingsWidget.ts
│   ├── textFormatter.ts
│   ├── utils.ts
│   └── styles/
├── index.html
├── vite.config.ts
├── package.json
└── bunfig.toml
```

---

## 關鍵改動細節

### 1. VSCode API Shim（`web/vscodeApi.ts`，新增）

替換 `acquireVsCodeApi()`，透過 WebSocket 與 Bun server 通訊：

```typescript
const ws = new WebSocket('ws://localhost:3000/ws')

export function acquireVsCodeApi() {
  return {
    postMessage: (msg: RequestMessage) => ws.send(JSON.stringify(msg)),
    getState: () => JSON.parse(localStorage.getItem('git-graph-state') ?? 'null'),
    setState: (state: WebViewState) => localStorage.setItem('git-graph-state', JSON.stringify(state)),
  }
}

// 將 WS 訊息對應到原版 window message event
ws.onmessage = (event) => {
  window.dispatchEvent(new MessageEvent('message', { data: JSON.parse(event.data) }))
}
```

`web/main.ts` 只需將原本的 `acquireVsCodeApi()` 呼叫改為從此 shim import。

### 2. 訊息協議

保留原版 `RequestMessage` / `ResponseMessage` 型別完全不變，前後端透過 WebSocket 傳遞 JSON，格式與原版 postMessage 相同。

#### HTTP 端點

WebSocket 處理所有 git 操作訊息。HTTP 額外提供：

| 端點 | 用途 |
|---|---|
| `GET /` | 靜態 HTML（production 模式） |
| `GET /avatars/:hash` | 頭像圖片（原版 avatarManager 快取） |
| `GET /diff` | diff 內容（以 text/plain 回傳，瀏覽器新分頁顯示）。Query params：`repo`、`fromHash`、`toHash`、`oldFilePath`、`newFilePath`、`type`（A/M/D/R/U） |

Dev 模式下靜態資源由 Vite 處理，`/avatars` 和 `/diff` 由 Vite proxy 轉發到 Bun。

#### 訊息方向

- **前端 → 後端（RequestMessage via WS）**：所有 git 操作請求（fetchCommits、checkoutBranch、addTag 等 ~40 種）
- **後端 → 前端（ResponseMessage via WS）**：對應回應，以及非請求觸發的推送（`refresh`、`repoWatcherFileChanged`）

#### 請求/回應關聯

原版 VSCode postMessage 為 fire-and-forget，以 `command` 欄位辨識回應。瀏覽器 WebSocket 有斷線風險，因此改為加入 `requestId`：

- 前端發送每個 RequestMessage 時附加 `requestId: string`（nanoid 生成）
- Bun server 在對應 ResponseMessage 中回傳相同 `requestId`
- 前端維護 pending request map；若 WebSocket 重連，pending requests 一律視為失敗（回傳 error），不自動重送（避免重複執行 checkout、tag 等 mutating 操作）
- 非請求觸發的推送（`refresh`）不含 `requestId`

### 3. 狀態持久化（`server/extensionState.ts`）

原版使用 `vscode.ExtensionContext.globalState`（VSCode 內建 key-value store），改為 Bun SQLite：

- 資料庫位置：`~/.git-graph-web/state.db`
- 儲存內容：code review 記錄、avatar cache 路徑、使用者設定覆寫

### 4. Repo 路徑指定

原版從 `vscode.workspace.workspaceFolders` 取得，改為：
- 環境變數 `REPO_PATH`
- CLI 參數 `--repo /path/to/repo`
- 預設：process 當前工作目錄

### 5. 即時刷新

Bun server 使用 `fs.watch` 監聽 repo `.git/` 目錄，觸發條件與原版 `RepoFileWatcher` 相同：

- 監聽路徑：`.git/HEAD`、`.git/refs/`、`.git/packed-refs`、`.git/stash`
- 推送訊息：`{ command: 'refresh' }` → 前端重新呼叫 `loadRepoInfo` + `loadCommits`
- 防抖：500ms debounce，避免 git 操作期間連續觸發

### 6. 設定來源

原版讀取 `vscode.workspace.getConfiguration('git-graph')`，改為：

- **預設值**：原版所有設定保留 hardcoded 預設（v1 不提供設定 UI）
- **覆寫**：支援 `~/.git-graph-web/config.json`，格式與原版設定 key 相同
- **v1 範圍**：僅支援最常用設定（graph colours、date format、commit ordering），其餘使用預設值

### 7. Git 憑證處理

遠端操作（fetch、push、pull）需要 git 憑證：

- **v1 策略**：要求使用者預先設定 git credential helper 或 SSH key（不提供 passphrase 輸入 UI）
- 若 git 操作因憑證問題失敗，回傳錯誤訊息顯示在原版的 error dialog
- `askpass` 相關邏輯（原版用於 VSCode 環境）在 v1 移除

### 8. 多 repo 支援

**降級為單一 repo**：v1 只支援單一 repo，明確 descope 多 repo。

原版 repoDropdown（切換多個 repo 的 UI）在 v1 保留 DOM 但 disabled，顯示一個 repo。

### 9. 錯誤處理

| 情境 | 行為 |
|---|---|
| git 不在 PATH | Bun server 啟動時檢查，失敗則 log 並退出 |
| REPO_PATH 非 git repo | server 啟動時 `git rev-parse` 驗證，失敗則退出並顯示錯誤 |
| git 指令 timeout | 30 秒 timeout，回傳 `ErrorInfo` 訊息到前端 error dialog |
| WebSocket 斷線 | 前端自動重連（指數退避，最多 5 次） |
| git 操作失敗 | 原版 `ErrorInfo` 格式回傳，前端顯示原版 error dialog |

### 10. VSCode 特定功能移除或降級

| 原版功能 | v1 處理方式 | UI 行為 |
|---|---|---|
| `vscode.env.openExternal` | 改用 `window.open` | 功能保留 |
| `viewDiff` | HTTP GET /diff → 新分頁顯示 | 功能保留（降級） |
| `viewScm` | 移除 | 按鈕隱藏 |
| `openGitTerminal` | 移除 | 按鈕隱藏 |
| `copyFilePathToClipboard` | `navigator.clipboard.writeText` | 功能保留 |
| Tab icon / status bar | 移除 | 不顯示 |
| `openExtensionSettings` | 移除 | 按鈕隱藏 |

---

## Vite 設定

```typescript
// vite.config.ts
export default {
  root: '.',
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
}
```

---

## 啟動方式

```bash
# 安裝依賴
bun install

# 開發模式（Bun server + Vite HMR 同時啟動）
bun run dev

# 指定 repo 路徑
REPO_PATH=/path/to/repo bun run dev

# Production build
bun run build

# Production 啟動（Bun serve 靜態檔 + API）
bun run start
```

---

## Port 設定

| 服務 | 預設 Port | 環境變數覆寫 |
|---|---|---|
| Bun server | 3000 | `PORT` |
| Vite dev server | 5173 | `VITE_PORT` |

Port 衝突時 Bun server 顯示錯誤並退出，不自動尋找下一個可用 port。

## 瀏覽器相容性

目標：現代瀏覽器（Chrome 90+、Firefox 88+、Safari 14+）。WebSocket、Canvas API、Clipboard API 均在此範圍內原生支援，不需 polyfill。

## SQLite Schema

```sql
-- code review 記錄（原版 ExtensionState.codeReviews）
CREATE TABLE code_reviews (
  repo TEXT NOT NULL,
  id TEXT NOT NULL,
  last_active_date INTEGER NOT NULL,
  files TEXT NOT NULL,  -- JSON
  PRIMARY KEY (repo, id)
);

-- avatar cache（原版 ExtensionState.avatarStoragePath 等）
CREATE TABLE avatars (
  email TEXT PRIMARY KEY,
  image BLOB NOT NULL,
  timestamp INTEGER NOT NULL
);
```

## 不在範圍內

- 多 repo 支援（v1 單一 repo）
- 多視窗 / 多 tab 支援
- 遠端 repo（GitHub/GitLab API）
- 設定 UI（v1 hardcoded 預設）
- Git 憑證輸入 UI
- Docker 部署

---

## 實作順序（高層）

1. 建立專案骨架（package.json、vite.config.ts、index.html）
2. Clone 並移植 `server/dataSource.ts`（移除 vscode.*）
3. 實作 `server/index.ts`（Bun HTTP + WebSocket + 訊息路由）
4. 新增 `web/vscodeApi.ts` shim，調整 `web/main.ts`
5. 移植其餘 server/ 模組（repoManager、avatarManager、extensionState）
6. 端對端測試：基本 git log 顯示
7. 完整功能測試：branch、merge、fetch 等操作
8. Production build 驗證
