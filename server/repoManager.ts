import { DataSource } from './dataSource';
import { ExtensionState } from './extensionState';
import { Logger } from './logger';
import { GitRepoSet, GitRepoState } from './types';
import { DisposableBase } from './utils/disposable';
import { Event, EventEmitter } from './utils/event';

export interface RepoChangeEvent {
	readonly repos: GitRepoSet;
	readonly numRepos: number;
	readonly loadRepo: string | null;
}

export class RepoManager extends DisposableBase {
	private readonly dataSource: DataSource;
	private readonly extensionState: ExtensionState;
	private readonly logger: Logger;
	private readonly repoPath: string;

	private readonly repoEventEmitter: EventEmitter<RepoChangeEvent>;

	constructor(dataSource: DataSource, extensionState: ExtensionState, logger: Logger, repoPath: string) {
		super();
		this.dataSource = dataSource;
		this.extensionState = extensionState;
		this.logger = logger;
		this.repoPath = repoPath;

		this.repoEventEmitter = new EventEmitter<RepoChangeEvent>();

		this.registerDisposables(
			this.repoEventEmitter
		);
	}

	get onDidChangeRepos() {
		return this.repoEventEmitter.subscribe;
	}

	public getRepos(): GitRepoSet {
		const state = this.extensionState.getRepoState(this.repoPath);
		return {
			[this.repoPath]: state
		};
	}

	public getNumRepos(): number {
		return 1;
	}

	public getRepoContainingFile(path: string): string | null {
		// Just assume the file is in the single repo if it's running
		return this.repoPath;
	}

	public async getKnownRepo(repo: string): Promise<string | null> {
		if (repo === this.repoPath) return repo;
		return null;
	}

	public isKnownRepo(repo: string): boolean {
		return repo === this.repoPath;
	}

	public checkReposExist(): Promise<boolean> {
		return Promise.resolve(false); // No dynamic repos
	}

	public setRepoState(repo: string, state: GitRepoState) {
		if (repo === this.repoPath) {
			this.extensionState.setRepoState(repo, state);
			this.repoEventEmitter.emit({
				repos: this.getRepos(),
				numRepos: 1,
				loadRepo: null
			});
		}
	}
}
