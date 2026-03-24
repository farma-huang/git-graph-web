import { serve, file } from 'bun';
import { DataSource } from './dataSource';
import { ExtensionState } from './extensionState';
import { RepoManager } from './repoManager';
import { AvatarManager } from './avatarManager';
import { RepoFileWatcher } from './repoFileWatcher';
import { Logger } from './logger';
import { findGit } from './utils';
import { MessageRouter } from './routes';
import { Event } from './utils/event';
import { RequestMessage, GitGraphViewInitialState } from './types';
import { getConfig } from './config';
import * as path from 'path';

async function main() {
	const logger = new Logger();
	const state = new ExtensionState();
	const gitExec = await findGit().catch(() => null);

	if (!gitExec) {
		console.error('Failed to find Git executable');
		process.exit(1);
	}

	const mockEvent: Event<any> = (listener) => ({ dispose: () => {} });
	const dataSource = new DataSource(gitExec, mockEvent, mockEvent, logger);
	
	const repoPath = process.env.GIT_GRAPH_WEB_REPO_PATH ?? process.cwd();
	const repoManager = new RepoManager(dataSource, state, logger, repoPath);
	const avatarManager = new AvatarManager(dataSource, state, logger);

	const router = new MessageRouter(dataSource, state, repoManager, avatarManager, repoPath);

	const connectedClients = new Set<any>();

	const fileWatcher = new RepoFileWatcher(logger, () => {
		for (const ws of connectedClients) {
			ws.send(JSON.stringify({ command: 'refresh' }));
		}
	});
	fileWatcher.start(repoPath);

	repoManager.onDidChangeRepos((event) => {
		for (const ws of connectedClients) {
			ws.send(JSON.stringify({ command: 'refresh' }));
		}
	});

	avatarManager.onAvatar((event) => {
		for (const ws of connectedClients) {
			ws.send(JSON.stringify({ command: 'fetchAvatar', ...event }));
		}
	});

	const distPath = path.join(__dirname, '..', 'web', 'dist');

	function buildInitialState(): GitGraphViewInitialState {
		const config = getConfig();
		return {
			config: {
				commitDetailsView: config.commitDetailsView,
				commitOrdering: config.commitOrder,
				contextMenuActionsVisibility: config.contextMenuActionsVisibility,
				customBranchGlobPatterns: config.customBranchGlobPatterns,
				customEmojiShortcodeMappings: config.customEmojiShortcodeMappings,
				customPullRequestProviders: config.customPullRequestProviders,
				dateFormat: config.dateFormat,
				defaultColumnVisibility: config.defaultColumnVisibility,
				dialogDefaults: config.dialogDefaults,
				enhancedAccessibility: config.enhancedAccessibility,
				fetchAndPrune: config.fetchAndPrune,
				fetchAndPruneTags: config.fetchAndPruneTags,
				fetchAvatars: config.fetchAvatars,
				graph: config.graph,
				includeCommitsMentionedByReflogs: config.includeCommitsMentionedByReflogs,
				initialLoadCommits: config.initialLoadCommits,
				keybindings: config.keybindings,
				loadMoreCommits: config.loadMoreCommits,
				loadMoreCommitsAutomatically: config.loadMoreCommitsAutomatically,
				markdown: config.markdown,
				mute: config.muteCommits,
				onlyFollowFirstParent: config.onlyFollowFirstParent,
				onRepoLoad: config.onRepoLoad,
				referenceLabels: config.referenceLabels,
				repoDropdownOrder: config.repoDropdownOrder,
				showRemoteBranches: config.showRemoteBranches,
				showStashes: config.showStashes,
				showTags: config.showTags
			},
			lastActiveRepo: repoPath,
			loadViewTo: null,
			repos: repoManager.getRepos(),
			loadRepoInfoRefreshId: 0,
			loadCommitsRefreshId: 0
		};
	}

	serve({
		port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
		async fetch(req, server) {
			if (server.upgrade(req)) return;

			const url = new URL(req.url);
			let pathname = url.pathname;

			if (pathname === '/api/initial-state') {
				return new Response(JSON.stringify(buildInitialState()), {
					headers: { 'Content-Type': 'application/json' }
				});
			}

			if (pathname === '/') pathname = '/index.html';

			try {
				const fp = path.join(distPath, pathname);
				const f = file(fp);
				if (await f.exists()) {
					return new Response(f);
				}
			} catch (_) {}

			return new Response('Not Found', { status: 404 });
		},
		websocket: {
			open(ws) {
				connectedClients.add(ws);
				ws.send(JSON.stringify({ command: 'refresh' }));
			},
			message(ws, message) {
				try {
					const msg = JSON.parse(message.toString()) as RequestMessage;
					router.handleMessage(ws as any, msg);
				} catch (e) {
					console.error('Failed to parse message:', e);
				}
			},
			close(ws) {
				connectedClients.delete(ws);
			}
		}
	});

	console.log(`Git Graph Web server running at http://localhost:${process.env.PORT || 3000}`);
}

main().catch(console.error);
