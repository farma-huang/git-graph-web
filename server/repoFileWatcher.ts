import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';

const FILE_CHANGE_REGEX = /(^\.git\/(config|index|HEAD|refs\/stash|refs\/heads\/.*|refs\/remotes\/.*|refs\/tags\/.*)$)|(^(?!\.git).*$)|(^\.git[^\/]+$)/;

/**
 * Watches a Git repository for file events using fs.watch.
 */
export class RepoFileWatcher {
	private readonly logger: Logger;
	private readonly repoChangeCallback: () => void;
	private repo: string | null = null;
	private fsWatcher: fs.FSWatcher | null = null;
	private refreshTimeout: NodeJS.Timer | null = null;
	private muted: boolean = false;
	private resumeAt: number = 0;

	constructor(logger: Logger, repoChangeCallback: () => void) {
		this.logger = logger;
		this.repoChangeCallback = repoChangeCallback;
	}

	public start(repo: string) {
		if (this.fsWatcher !== null) {
			this.stop();
		}

		this.repo = repo;
		try {
			this.fsWatcher = fs.watch(repo, { recursive: true }, (eventType, filename) => {
				if (filename) {
					// Convert Windows backslashes to forward slashes for the regex
					const normalizedFilename = filename.replace(/\\/g, '/');
					this.refresh(normalizedFilename);
				}
			});
			this.logger.log('Started watching repo: ' + repo);
		} catch (e) {
			this.logger.logError('Failed to start watching repo: ' + e);
		}
	}

	public stop() {
		if (this.fsWatcher !== null) {
			this.fsWatcher.close();
			this.fsWatcher = null;
			this.logger.log('Stopped watching repo: ' + this.repo);
		}
		if (this.refreshTimeout !== null) {
			clearTimeout(this.refreshTimeout);
			this.refreshTimeout = null;
		}
	}

	public mute() {
		this.muted = true;
	}

	public unmute() {
		this.muted = false;
		this.resumeAt = (new Date()).getTime() + 1500;
	}

	private refresh(filename: string) {
		if (this.muted) return;
		if (!filename.match(FILE_CHANGE_REGEX)) return;
		if ((new Date()).getTime() < this.resumeAt) return;

		if (this.refreshTimeout !== null) {
			clearTimeout(this.refreshTimeout);
		}
		this.refreshTimeout = setTimeout(() => {
			this.refreshTimeout = null;
			this.repoChangeCallback();
		}, 750);
	}
}
