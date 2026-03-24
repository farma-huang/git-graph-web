import { Database } from 'bun:sqlite';
import { mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import { BooleanOverride, CodeReview, FileViewType, GitGraphViewGlobalState, GitGraphViewWorkspaceState, GitRepoState, RepoCommitOrdering } from './types';
import { getConfig } from './config';

function getDataDir(): string {
  return process.env.GIT_GRAPH_WEB_DATA_DIR ?? join(homedir(), '.git-graph-web');
}

export const DEFAULT_REPO_STATE: GitRepoState = {
	cdvDivider: 0.5,
	cdvHeight: 250,
	columnWidths: null,
	commitOrdering: RepoCommitOrdering.Default,
	fileViewType: FileViewType.Default,
	hideRemotes: [],
	includeCommitsMentionedByReflogs: BooleanOverride.Default,
	issueLinkingConfig: null,
	lastImportAt: 0,
	name: null,
	onlyFollowFirstParent: BooleanOverride.Default,
	onRepoLoadShowCheckedOutBranch: BooleanOverride.Default,
	onRepoLoadShowSpecificBranches: null,
	pullRequestConfig: null,
	showRemoteBranches: true,
	showRemoteBranchesV2: BooleanOverride.Default,
	showStashes: BooleanOverride.Default,
	showTags: BooleanOverride.Default,
	workspaceFolderIndex: null
};

const DEFAULT_GIT_GRAPH_VIEW_GLOBAL_STATE: GitGraphViewGlobalState = {
	alwaysAcceptCheckoutCommit: false,
	issueLinkingConfig: null,
	pushTagSkipRemoteCheck: false
};

const DEFAULT_GIT_GRAPH_VIEW_WORKSPACE_STATE: GitGraphViewWorkspaceState = {
	findIsCaseSensitive: false,
	findIsRegex: false,
	findOpenCommitDetailsView: false
};

export class ExtensionState {
  private readonly db: Database;

  constructor() {
    const dir = getDataDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.db = new Database(join(dir, 'state.db'));
    this.initSchema();
  }

  private initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS code_reviews (
        repo TEXT NOT NULL,
        id TEXT NOT NULL,
        last_active_date INTEGER NOT NULL,
        files TEXT NOT NULL,
        PRIMARY KEY (repo, id)
      )
    `);
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

  public getRepoState(repo: string): GitRepoState {
    const state = this.kvGet<GitRepoState>(`repoState:${repo}`, DEFAULT_REPO_STATE);
    const output = Object.assign({}, DEFAULT_REPO_STATE, state);
    if (typeof state.showRemoteBranchesV2 === 'undefined' && typeof state.showRemoteBranches !== 'undefined') {
        const showRemoteBranchesDefaultValue = getConfig().showRemoteBranches;
        if (state.showRemoteBranches !== showRemoteBranchesDefaultValue) {
            output.showRemoteBranchesV2 = state.showRemoteBranches ? BooleanOverride.Enabled : BooleanOverride.Disabled;
        }
    }
    return output;
  }

  public setRepoState(repo: string, state: GitRepoState): void {
    this.kvSet(`repoState:${repo}`, state);
  }

  public getGlobalViewState(): GitGraphViewGlobalState {
    const state = this.kvGet<GitGraphViewGlobalState>('globalViewState', DEFAULT_GIT_GRAPH_VIEW_GLOBAL_STATE);
    return Object.assign({}, DEFAULT_GIT_GRAPH_VIEW_GLOBAL_STATE, state);
  }

  public setGlobalViewState(state: GitGraphViewGlobalState): Promise<null> {
    this.kvSet('globalViewState', state);
    return Promise.resolve(null);
  }

  public getWorkspaceViewState(): GitGraphViewWorkspaceState {
    const state = this.kvGet<GitGraphViewWorkspaceState>('workspaceViewState', DEFAULT_GIT_GRAPH_VIEW_WORKSPACE_STATE);
    return Object.assign({}, DEFAULT_GIT_GRAPH_VIEW_WORKSPACE_STATE, state);
  }

  public setWorkspaceViewState(state: GitGraphViewWorkspaceState): Promise<null> {
    this.kvSet('workspaceViewState', state);
    return Promise.resolve(null);
  }

  public saveAvatar(email: string, image: Buffer): void {
    this.db.run(
      'INSERT OR REPLACE INTO avatars (email, image, timestamp) VALUES (?, ?, ?)',
      [email, image, Date.now()]
    );
  }

  public getAvatar(email: string): Buffer | null {
    const row = this.db.query('SELECT image FROM avatars WHERE email = ?').get(email) as { image: Buffer } | null;
    return row ? row.image : null;
  }

  public getCodeReviews(repo: string): { [id: string]: { lastActive: number, lastViewedFile: string | null, remainingFiles: string[] } } {
    const rows = this.db.query('SELECT id, last_active_date, files FROM code_reviews WHERE repo = ?').all(repo) as { id: string, last_active_date: number, files: string }[];
    const result: { [id: string]: { lastActive: number, lastViewedFile: string | null, remainingFiles: string[] } } = {};
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.files);
        result[row.id] = {
          lastActive: row.last_active_date,
          lastViewedFile: parsed.lastViewedFile,
          remainingFiles: parsed.remainingFiles
        };
      } catch { }
    }
    return result;
  }

  public saveCodeReview(repo: string, id: string, data: { lastActive: number, lastViewedFile: string | null, remainingFiles: string[] }): void {
    this.db.run(
      'INSERT OR REPLACE INTO code_reviews (repo, id, last_active_date, files) VALUES (?, ?, ?, ?)',
      [repo, id, data.lastActive, JSON.stringify({ lastViewedFile: data.lastViewedFile, remainingFiles: data.remainingFiles })]
    );
  }

  public endCodeReview(repo: string, id: string): void {
    this.db.run('DELETE FROM code_reviews WHERE repo = ? AND id = ?', [repo, id]);
  }

  public updateCodeReview(repo: string, id: string, remainingFiles: string[], lastViewedFile: string | null): Promise<string | null> {
    const review = this.getCodeReviews(repo)[id];
    if (!review) return Promise.resolve('The Code Review could not be found.');

    if (remainingFiles.length > 0) {
      this.saveCodeReview(repo, id, {
        lastActive: Date.now(),
        lastViewedFile: lastViewedFile !== null ? lastViewedFile : review.lastViewedFile,
        remainingFiles: remainingFiles
      });
    } else {
      this.endCodeReview(repo, id);
    }
    return Promise.resolve(null);
  }
}
