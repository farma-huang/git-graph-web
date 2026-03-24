import { ServerWebSocket } from 'bun';
import { DataSource } from './dataSource';
import { ExtensionState } from './extensionState';
import { RepoManager } from './repoManager';
import { AvatarManager } from './avatarManager';
import { RequestMessage, ResponseMessage } from './types';

export class MessageRouter {
	constructor(
		private readonly dataSource: DataSource,
		private readonly extensionState: ExtensionState,
		private readonly repoManager: RepoManager,
		private readonly avatarManager: AvatarManager,
		private readonly repoPath: string
	) {}

	public async handleMessage(ws: ServerWebSocket<unknown>, msg: RequestMessage): Promise<void> {
		try {
			switch (msg.command) {
				case 'addRemote':
					this.send(ws, msg, {
						command: 'addRemote',
						error: await this.dataSource.addRemote(this.repoPath, msg.name, msg.url, msg.pushUrl, msg.fetch)
					} as any);
					break;
				case 'addTag':
					this.send(ws, msg, {
						command: 'addTag',
						errors: [await this.dataSource.addTag(this.repoPath, msg.tagName, msg.commitHash, msg.type, msg.message, msg.force)]
					} as any);
					break;
				case 'applyStash':
					this.send(ws, msg, {
						command: 'applyStash',
						error: await this.dataSource.applyStash(this.repoPath, msg.selector, msg.reinstateIndex)
					} as any);
					break;
				case 'branchFromStash':
					this.send(ws, msg, {
						command: 'branchFromStash',
						error: await this.dataSource.branchFromStash(this.repoPath, msg.selector, msg.branchName)
					} as any);
					break;
				case 'checkoutBranch':
					this.send(ws, msg, {
						command: 'checkoutBranch',
						errors: [await this.dataSource.checkoutBranch(this.repoPath, msg.branchName, msg.remoteBranch)]
					} as any);
					break;
				case 'checkoutCommit':
					this.send(ws, msg, {
						command: 'checkoutCommit',
						error: await this.dataSource.checkoutCommit(this.repoPath, msg.commitHash)
					} as any);
					break;
				case 'cherrypickCommit':
					this.send(ws, msg, {
						command: 'cherrypickCommit',
						errors: [await this.dataSource.cherrypickCommit(this.repoPath, msg.commitHash, msg.parentIndex, msg.recordOrigin, msg.noCommit)]
					} as any);
					break;
				case 'cleanUntrackedFiles':
					this.send(ws, msg, {
						command: 'cleanUntrackedFiles',
						error: await this.dataSource.cleanUntrackedFiles(this.repoPath, msg.directories)
					} as any);
					break;
			case 'commitDetails': {
				const details = await this.dataSource.getCommitDetails(this.repoPath, msg.commitHash, msg.hasParents);
				const codeReviews = this.extensionState.getCodeReviews(this.repoPath);
				const codeReview = codeReviews[msg.commitHash]
					? { id: msg.commitHash, lastViewedFile: codeReviews[msg.commitHash].lastViewedFile, remainingFiles: codeReviews[msg.commitHash].remainingFiles }
					: null;
				this.send(ws, msg, {
					command: 'commitDetails',
					...details,
					codeReview,
					avatar: null,
					refresh: msg.refresh
				} as any);
				break;
			}


				case 'compareCommits':
					this.send(ws, msg, {
						command: 'compareCommits',
						commitHash: msg.commitHash,
						compareWithHash: msg.compareWithHash,
						...(await this.dataSource.getCommitComparison(this.repoPath, msg.compareWithHash, msg.commitHash))
					} as any);
					break;
				case 'createBranch':
					this.send(ws, msg, {
						command: 'createBranch',
						errors: await this.dataSource.createBranch(this.repoPath, msg.branchName, msg.commitHash, msg.checkout, msg.force)
					} as any);
					break;
				case 'deleteBranch':
					this.send(ws, msg, {
						command: 'deleteBranch',
						errors: [await this.dataSource.deleteBranch(this.repoPath, msg.branchName, msg.forceDelete)]
					} as any);
					break;
				case 'deleteRemoteBranch':
					this.send(ws, msg, {
						command: 'deleteRemoteBranch',
						error: await this.dataSource.deleteRemoteBranch(this.repoPath, msg.branchName, msg.remote)
					} as any);
					break;
				case 'deleteRemote':
					this.send(ws, msg, {
						command: 'deleteRemote',
						error: await this.dataSource.deleteRemote(this.repoPath, msg.name)
					} as any);
					break;
				case 'deleteTag':
					this.send(ws, msg, {
						command: 'deleteTag',
						error: await this.dataSource.deleteTag(this.repoPath, msg.tagName, msg.deleteOnRemote)
					} as any);
					break;
				case 'dropCommit':
					this.send(ws, msg, {
						command: 'dropCommit',
						error: await this.dataSource.dropCommit(this.repoPath, msg.commitHash)
					} as any);
					break;
				case 'dropStash':
					this.send(ws, msg, {
						command: 'dropStash',
						error: await this.dataSource.dropStash(this.repoPath, msg.selector)
					} as any);
					break;
				case 'editRemote':
					this.send(ws, msg, {
						command: 'editRemote',
						error: await this.dataSource.editRemote(this.repoPath, msg.nameOld, msg.nameNew, msg.urlOld, msg.urlNew, msg.pushUrlOld, msg.pushUrlNew)
					} as any);
					break;
				case 'fetch':
					this.send(ws, msg, {
						command: 'fetch',
						error: await this.dataSource.fetch(this.repoPath, msg.name, msg.prune, msg.pruneTags)
					} as any);
					break;
				case 'fetchAvatar':
					this.avatarManager.fetchAvatarImage(msg.email, msg.repo, msg.remote, msg.commits);
					break;
				case 'fetchIntoLocalBranch':
					this.send(ws, msg, {
						command: 'fetchIntoLocalBranch',
						error: await this.dataSource.fetchIntoLocalBranch(this.repoPath, msg.remote, msg.remoteBranch, msg.localBranch, msg.force)
					} as any);
					break;
				case 'loadConfig': {
					const configData = await this.dataSource.getConfig(this.repoPath, msg.remotes);
					this.send(ws, msg, {
						command: 'loadConfig',
						repo: this.repoPath,
						config: configData.config,
						error: configData.error
					} as any);
					break;
				}
				case 'loadCommits':
					this.send(ws, msg, {
						command: 'loadCommits',
						...(await this.dataSource.getCommits(this.repoPath, msg.branches, msg.maxCommits, msg.showTags, msg.showRemoteBranches, msg.includeCommitsMentionedByReflogs, msg.onlyFollowFirstParent, msg.commitOrdering, msg.remotes, msg.hideRemotes, msg.stashes))
					} as any);
					break;
				case 'loadRepoInfo':
					const info = await this.dataSource.getRepoInfo(this.repoPath, msg.showRemoteBranches, msg.showStashes, msg.hideRemotes);
					const isKnown = this.repoManager.isKnownRepo(this.repoPath);
					console.log('[loadRepoInfo] repoPath:', this.repoPath, 'isKnown:', isKnown, 'branches:', (info as any).branches?.length);
					this.send(ws, msg, {
						command: 'loadRepoInfo',
						...info,
						isRepo: isKnown
					} as any);
					break;
				case 'merge':
					this.send(ws, msg, {
						command: 'merge',
						error: await this.dataSource.merge(this.repoPath, msg.obj, msg.actionOn, msg.createNewCommit, msg.squash, msg.noCommit)
					} as any);
					break;
				case 'popStash':
					this.send(ws, msg, {
						command: 'popStash',
						error: await this.dataSource.popStash(this.repoPath, msg.selector, msg.reinstateIndex)
					} as any);
					break;
				case 'pruneRemote':
					this.send(ws, msg, {
						command: 'pruneRemote',
						error: await this.dataSource.pruneRemote(this.repoPath, msg.name)
					} as any);
					break;
				case 'pullBranch':
					this.send(ws, msg, {
						command: 'pullBranch',
						error: await this.dataSource.pullBranch(this.repoPath, msg.branchName, msg.remote, msg.createNewCommit, msg.squash)
					} as any);
					break;
				case 'pushBranch':
					this.send(ws, msg, {
						command: 'pushBranch',
						errors: await this.dataSource.pushBranchToMultipleRemotes(this.repoPath, msg.branchName, msg.remotes, msg.setUpstream, msg.mode)
					} as any);
					break;
				case 'pushStash':
					this.send(ws, msg, {
						command: 'pushStash',
						error: await this.dataSource.pushStash(this.repoPath, msg.message, msg.includeUntracked)
					} as any);
					break;
				case 'pushTag':
					this.send(ws, msg, {
						command: 'pushTag',
						errors: await this.dataSource.pushTag(this.repoPath, msg.tagName, msg.remotes, msg.commitHash, msg.skipRemoteCheck)
					} as any);
					break;
				case 'rebase':
					this.send(ws, msg, {
						command: 'rebase',
						error: await this.dataSource.rebase(this.repoPath, msg.obj, msg.actionOn, msg.ignoreDate, msg.interactive)
					} as any);
					break;
				case 'renameBranch':
					this.send(ws, msg, {
						command: 'renameBranch',
						error: await this.dataSource.renameBranch(this.repoPath, msg.oldName, msg.newName)
					} as any);
					break;
				case 'resetToCommit':
					this.send(ws, msg, {
						command: 'resetToCommit',
						error: await this.dataSource.resetToCommit(this.repoPath, msg.commit, msg.resetMode)
					} as any);
					break;
				case 'revertCommit':
					this.send(ws, msg, {
						command: 'revertCommit',
						error: await this.dataSource.revertCommit(this.repoPath, msg.commitHash, msg.parentIndex)
					} as any);
					break;
				case 'setRepoState':
					this.repoManager.setRepoState(this.repoPath, msg.state);
					break;
			}
		} catch (e) {
			console.error(`Error handling message ${msg.command}:`, e);
		}
	}

	private send(ws: ServerWebSocket<unknown>, req: RequestMessage, res: Partial<ResponseMessage> & { command: string }) {
		const fullRes = { ...res, requestId: req.requestId, refreshId: (req as any).refreshId } as ResponseMessage;
		ws.send(JSON.stringify(fullRes));
	}
}
