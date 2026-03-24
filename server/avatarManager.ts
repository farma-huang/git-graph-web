import * as crypto from 'crypto';
import * as https from 'https';
import * as url from 'url';
import { DataSource } from './dataSource';
import { ExtensionState } from './extensionState';
import { Logger } from './logger';
import { DisposableBase, toDisposable } from './utils/disposable';
import { EventEmitter } from './utils/event';

export interface AvatarEvent {
	email: string;
	image: string;
}

export class AvatarManager extends DisposableBase {
	private readonly dataSource: DataSource;
	private readonly extensionState: ExtensionState;
	private readonly logger: Logger;
	private readonly avatarEventEmitter: EventEmitter<AvatarEvent>;

	private queue: AvatarRequestQueue;
	private remoteSourceCache: { [repo: string]: RemoteSource } = {};
	private interval: NodeJS.Timer | null = null;

	private githubTimeout: number = 0;
	private gitLabTimeout: number = 0;

	constructor(dataSource: DataSource, extensionState: ExtensionState, logger: Logger) {
		super();
		this.dataSource = dataSource;
		this.extensionState = extensionState;
		this.logger = logger;
		this.avatarEventEmitter = new EventEmitter<AvatarEvent>();
		
		this.queue = new AvatarRequestQueue(() => {
			if (this.interval !== null) return;
			this.interval = setInterval(() => {
				this.fetchAvatarsInterval();
			}, 10000);
			this.fetchAvatarsInterval();
		});

		this.registerDisposables(
			toDisposable(() => {
				this.stopInterval();
			}),
			this.avatarEventEmitter
		);
	}

	private stopInterval() {
		if (this.interval !== null) {
			clearInterval(this.interval);
			this.interval = null;
			this.remoteSourceCache = {};
		}
	}

	public fetchAvatarImage(email: string, repo: string, remote: string | null, commits: string[]) {
		const existingBuffer = this.extensionState.getAvatar(email);
		if (existingBuffer !== null) {
			this.emitAvatar(email).catch(() => {
				this.queue.add(email, repo, remote, commits, true);
			});
		} else {
			this.queue.add(email, repo, remote, commits, true);
		}
	}

	public getAvatarImage(email: string): Promise<string | null> {
		return new Promise((resolve) => {
			const buffer = this.extensionState.getAvatar(email);
			if (buffer) {
				// We'll just assume jpeg/png or let the browser infer from base64
				resolve('data:image/jpeg;base64,' + buffer.toString('base64'));
			} else {
				resolve(null);
			}
		});
	}

	get onAvatar() {
		return this.avatarEventEmitter.subscribe;
	}

	private emitAvatar(email: string) {
		return new Promise<boolean>((resolve, reject) => {
			if (this.avatarEventEmitter.hasSubscribers()) {
				this.getAvatarImage(email).then((image) => {
					if (image === null) {
						reject();
					} else {
						this.avatarEventEmitter.emit({ email, image });
						resolve(true);
					}
				});
			} else {
				resolve(false);
			}
		});
	}

	private async fetchAvatarsInterval() {
		if (this.queue.hasItems()) {
			let avatarRequest = this.queue.takeItem();
			if (avatarRequest === null) return;

			let remoteSource = await this.getRemoteSource(avatarRequest);
			switch (remoteSource.type) {
				case 'github':
					this.fetchFromGithub(avatarRequest, remoteSource.owner, remoteSource.repo);
					break;
				case 'gitlab':
					this.fetchFromGitLab(avatarRequest);
					break;
				default:
					this.fetchFromGravatar(avatarRequest);
			}
		} else {
			this.stopInterval();
		}
	}

	private async getRemoteSource(avatarRequest: AvatarRequestItem): Promise<RemoteSource> {
		if (this.remoteSourceCache[avatarRequest.repo]) {
			return this.remoteSourceCache[avatarRequest.repo];
		}

		let remoteSource: RemoteSource = { type: 'gravatar' };
		if (avatarRequest.remote !== null) {
			let remoteUrl = await this.dataSource.getRemoteUrl(avatarRequest.repo, avatarRequest.remote);
			if (remoteUrl !== null) {
				let match;
				if ((match = remoteUrl.match(/^(https:\/\/github\.com\/|git@github\.com:)([^\/]+)\/(.*)\.git$/)) !== null) {
					remoteSource = { type: 'github', owner: match[2], repo: match[3] };
				} else if (remoteUrl.startsWith('https://gitlab.com/') || remoteUrl.startsWith('git@gitlab.com:')) {
					remoteSource = { type: 'gitlab' };
				}
			}
		}
		this.remoteSourceCache[avatarRequest.repo] = remoteSource;
		return remoteSource;
	}

	private fetchFromGithub(avatarRequest: AvatarRequestItem, owner: string, repo: string) {
		let t = Date.now();
		if (t < this.githubTimeout) {
			this.queue.addItem(avatarRequest, this.githubTimeout, false);
			this.fetchAvatarsInterval();
			return;
		}

		this.logger.log('Requesting Avatar for ' + maskEmail(avatarRequest.email) + ' from GitHub');

		const commitIndex = avatarRequest.commits.length < 5
			? avatarRequest.commits.length - 1 - avatarRequest.attempts
			: Math.round((4 - avatarRequest.attempts) * 0.25 * (avatarRequest.commits.length - 1));

		let triggeredOnError = false;
		const onError = () => {
			if (!triggeredOnError) {
				triggeredOnError = true;
				this.githubTimeout = t + 300000;
				this.queue.addItem(avatarRequest, this.githubTimeout, false);
			}
		};

		https.get({
			hostname: 'api.github.com', path: '/repos/' + owner + '/' + repo + '/commits/' + avatarRequest.commits[commitIndex],
			headers: { 'User-Agent': 'vscode-git-graph' },
			agent: false, timeout: 15000
		}, (res) => {
			let respBody = '';
			res.on('data', (chunk) => { respBody += chunk; });
			res.on('end', async () => {
				if (res.statusCode === 200) {
					let commit = JSON.parse(respBody);
					if (commit.author && commit.author.avatar_url) {
						let imgBuf = await this.downloadAvatarBuffer(commit.author.avatar_url + '&size=162');
						if (imgBuf) {
							this.extensionState.saveAvatar(avatarRequest.email, imgBuf);
							this.emitAvatar(avatarRequest.email);
						}
						return;
					}
				}
				this.fetchFromGravatar(avatarRequest);
			});
			res.on('error', onError);
		}).on('error', onError);
	}

	private fetchFromGitLab(avatarRequest: AvatarRequestItem) {
		this.fetchFromGravatar(avatarRequest);
	}

	private async fetchFromGravatar(avatarRequest: AvatarRequestItem) {
		this.logger.log('Requesting Avatar for ' + maskEmail(avatarRequest.email) + ' from Gravatar');
		const hash = crypto.createHash('md5').update(avatarRequest.email.trim().toLowerCase()).digest('hex');

		let imgBuf = await this.downloadAvatarBuffer('https://secure.gravatar.com/avatar/' + hash + '?s=162&d=404');
		if (!imgBuf) {
			imgBuf = await this.downloadAvatarBuffer('https://secure.gravatar.com/avatar/' + hash + '?s=162&d=identicon');
		}

		if (imgBuf) {
			this.extensionState.saveAvatar(avatarRequest.email, imgBuf);
			this.emitAvatar(avatarRequest.email);
		}
	}

	private downloadAvatarBuffer(imageUrl: string): Promise<Buffer | null> {
		return new Promise((resolve) => {
			const imgUrl = url.parse(imageUrl);
			https.get({
				hostname: imgUrl.hostname, path: imgUrl.path,
				headers: { 'User-Agent': 'vscode-git-graph' },
				agent: false, timeout: 15000
			}, (res) => {
				let imageBufferArray: Buffer[] = [];
				res.on('data', (chunk) => { imageBufferArray.push(chunk); });
				res.on('end', () => {
					if (res.statusCode === 200) {
						resolve(Buffer.concat(imageBufferArray));
					} else {
						resolve(null);
					}
				});
				res.on('error', () => resolve(null));
			}).on('error', () => resolve(null));
		});
	}
}

class AvatarRequestQueue {
	private queue: AvatarRequestItem[] = [];
	private itemsAvailableCallback: () => void;

	constructor(itemsAvailableCallback: () => void) {
		this.itemsAvailableCallback = itemsAvailableCallback;
	}

	public add(email: string, repo: string, remote: string | null, commits: string[], immediate: boolean) {
		const existingRequest = this.queue.find((request) => request.email === email && request.repo === repo);
		if (existingRequest) {
			commits.forEach((commit) => {
				if (!existingRequest.commits.includes(commit)) {
					existingRequest.commits.push(commit);
				}
			});
		} else {
			this.insertItem({
				email, repo, remote, commits,
				checkAfter: immediate || this.queue.length === 0 ? 0 : this.queue[this.queue.length - 1].checkAfter + 1,
				attempts: 0
			});
		}
	}

	public addItem(item: AvatarRequestItem, checkAfter: number, failedAttempt: boolean) {
		item.checkAfter = checkAfter;
		if (failedAttempt) item.attempts++;
		this.insertItem(item);
	}

	public hasItems() { return this.queue.length > 0; }
	public takeItem() {
		if (this.queue.length > 0 && this.queue[0].checkAfter < Date.now()) return this.queue.shift()!;
		return null;
	}

	private insertItem(item: AvatarRequestItem) {
		let l = 0, r = this.queue.length - 1, c, prevLength = this.queue.length;
		while (l <= r) {
			c = l + r >> 1;
			if (this.queue[c].checkAfter <= item.checkAfter) l = c + 1;
			else r = c - 1;
		}
		this.queue.splice(l, 0, item);
		if (prevLength === 0) this.itemsAvailableCallback();
	}
}

function maskEmail(email: string) {
	return email.substring(0, email.indexOf('@')) + '@*****';
}

interface AvatarRequestItem {
	email: string;
	repo: string;
	remote: string | null;
	commits: string[];
	checkAfter: number;
	attempts: number;
}
type RemoteSource = { type: 'github', owner: string, repo: string } | { type: 'gitlab' } | { type: 'gravatar' };
