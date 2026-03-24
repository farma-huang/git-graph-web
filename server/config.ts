import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import {
	CommitDetailsViewConfig,
	CommitDetailsViewLocation,
	CommitOrdering,
	ContextMenuActionsVisibility,
	CustomBranchGlobPattern,
	CustomEmojiShortcodeMapping,
	CustomPullRequestProvider,
	DateFormat,
	DateFormatType,
	DateType,
	DefaultColumnVisibility,
	DialogDefaults,
	FileViewType,
	GitResetMode,
	GraphConfig,
	GraphStyle,
	GraphUncommittedChangesStyle,
	KeybindingConfig,
	MuteCommitsConfig,
	OnRepoLoadConfig,
	RefLabelAlignment,
	ReferenceLabelsConfig,
	RepoDropdownOrder,
	SquashMessageFormat,
	TabIconColourTheme,
	TagType
} from './types';

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

class Config {
	private readonly userConfig: Partial<Record<string, unknown>>;

	private static readonly KEYBINDING_REGEXP = /^CTRL\/CMD \+ [A-Z]$/;

	constructor(repo?: string) {
		this.userConfig = loadUserConfig();
	}

	private get<T>(key: string, defaultValue: T): T {
		if (this.userConfig.hasOwnProperty(key)) {
			return this.userConfig[key] as T;
		}
		return defaultValue;
	}

	get commitDetailsView(): CommitDetailsViewConfig {
		return {
			autoCenter: true,
			fileTreeCompactFolders: true,
			fileViewType: FileViewType.Tree,
			location: CommitDetailsViewLocation.Inline
		};
	}

	get contextMenuActionsVisibility(): ContextMenuActionsVisibility {
		const config: ContextMenuActionsVisibility = {
			branch: { checkout: true, rename: true, delete: true, merge: true, rebase: true, push: true, viewIssue: true, createPullRequest: true, createArchive: true, selectInBranchesDropdown: true, unselectInBranchesDropdown: true, copyName: true },
			commit: { addTag: true, createBranch: true, checkout: true, cherrypick: true, revert: true, drop: true, merge: true, rebase: true, reset: true, copyHash: true, copySubject: true },
			commitDetailsViewFile: { viewDiff: true, viewFileAtThisRevision: true, viewDiffWithWorkingFile: true, openFile: true, markAsReviewed: true, markAsNotReviewed: true, resetFileToThisRevision: true, copyAbsoluteFilePath: true, copyRelativeFilePath: true },
			remoteBranch: { checkout: true, delete: true, fetch: true, merge: true, pull: true, viewIssue: true, createPullRequest: true, createArchive: true, selectInBranchesDropdown: true, unselectInBranchesDropdown: true, copyName: true },
			stash: { apply: true, createBranch: true, pop: true, drop: true, copyName: true, copyHash: true },
			tag: { viewDetails: true, delete: true, push: true, createArchive: true, copyName: true },
			uncommittedChanges: { stash: true, reset: true, clean: true, openSourceControlView: true }
		};
		return config;
	}

	get customBranchGlobPatterns(): CustomBranchGlobPattern[] { return []; }
	get customEmojiShortcodeMappings(): CustomEmojiShortcodeMapping[] { return []; }
	get customPullRequestProviders(): CustomPullRequestProvider[] { return []; }

	get dateFormat(): DateFormat {
		let configValue = this.get<string>('date.format', 'Date & Time'), type = DateFormatType.DateAndTime, iso = false;
		if (configValue === 'Relative') {
			type = DateFormatType.Relative;
		} else {
			if (configValue.endsWith('Date Only')) type = DateFormatType.DateOnly;
			if (configValue.startsWith('ISO')) iso = true;
		}
		return { type: type, iso: iso };
	}

	get dateType() { return DateType.Author; }
	get defaultColumnVisibility(): DefaultColumnVisibility { return { author: true, commit: true, date: true }; }
	get dialogDefaults(): DialogDefaults {
		return {
			addTag: { pushToRemote: false, type: TagType.Annotated },
			applyStash: { reinstateIndex: false },
			cherryPick: { noCommit: false, recordOrigin: false },
			createBranch: { checkout: false },
			deleteBranch: { forceDelete: false },
			fetchIntoLocalBranch: { forceFetch: false },
			fetchRemote: { prune: false, pruneTags: false },
			general: { referenceInputSpaceSubstitution: null },
			merge: { noCommit: false, noFastForward: true, squash: false },
			popStash: { reinstateIndex: false },
			pullBranch: { noFastForward: false, squash: false },
			rebase: { ignoreDate: true, interactive: false },
			resetCommit: { mode: GitResetMode.Mixed },
			resetUncommitted: { mode: GitResetMode.Mixed },
			stashUncommittedChanges: { includeUntracked: true }
		};
	}
	get squashMergeMessageFormat() { return SquashMessageFormat.Default; }
	get squashPullMessageFormat() { return SquashMessageFormat.Default; }
	get enhancedAccessibility() { return false; }
	get fileEncoding() { return 'utf8'; }

	get graph(): GraphConfig {
		const colours = this.get<string[]>('graph.colours', []);
		return {
			colours: Array.isArray(colours) && colours.length > 0
				? colours.filter((v) => v.match(/^\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|rgb[a]?\s*\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\))\s*$/) !== null)
				: ['#0085d9', '#d9008f', '#00d90a', '#d98500', '#a300d9', '#ff0000', '#00d9cc', '#e138e8', '#85d900', '#dc5b23', '#6f24d6', '#ffcc00'],
			style: GraphStyle.Rounded,
			grid: { x: 16, y: 24, offsetX: 16, offsetY: 12, expandY: 250 },
			uncommittedChanges: GraphUncommittedChangesStyle.OpenCircleAtTheUncommittedChanges
		};
	}

	get integratedTerminalShell() { return ''; }

	get keybindings(): KeybindingConfig {
		return { find: 'f', refresh: 'r', scrollToHead: 'h', scrollToStash: 's' };
	}

	get maxDepthOfRepoSearch() { return 0; }
	get markdown() { return true; }
	get openNewTabEditorGroup() { return 1; }
	get openToTheRepoOfTheActiveTextEditorDocument() { return false; }
	get referenceLabels(): ReferenceLabelsConfig {
		return {
			branchLabelsAlignedToGraph: false,
			combineLocalAndRemoteBranchLabels: true,
			tagLabelsOnRight: false
		};
	}

	get fetchAvatars() { return false; }
	get initialLoadCommits() { return 300; }
	get loadMoreCommits() { return 100; }
	get loadMoreCommitsAutomatically() { return true; }

	get muteCommits(): MuteCommitsConfig {
		return { commitsNotAncestorsOfHead: false, mergeCommits: true };
	}

	get commitOrder() {
		const ordering = this.get<string>('commitOrdering', 'date');
		return ordering === 'author-date'
			? CommitOrdering.AuthorDate
			: ordering === 'topo'
				? CommitOrdering.Topological
				: CommitOrdering.Date;
	}

	get showSignatureStatus() { return false; }
	get fetchAndPrune() { return false; }
	get fetchAndPruneTags() { return false; }
	get includeCommitsMentionedByReflogs() { return false; }
	get onRepoLoad(): OnRepoLoadConfig {
		return { scrollToHead: false, showCheckedOutBranch: false, showSpecificBranches: [] };
	}
	get onlyFollowFirstParent() { return false; }
	get showCommitsOnlyReferencedByTags() { return true; }
	get showRemoteBranches() { return true; }
	get showRemoteHeads() { return true; }
	get showStashes() { return true; }
	get showTags() { return true; }
	get showUncommittedChanges() { return true; }
	get showUntrackedFiles() { return true; }
	get signCommits() { return false; }
	get signTags() { return false; }
	get useMailmap() { return false; }
	get repoDropdownOrder(): RepoDropdownOrder { return RepoDropdownOrder.WorkspaceFullPath; }
	get retainContextWhenHidden() { return true; }
	get showStatusBarItem() { return true; }
	get tabIconColourTheme() { return TabIconColourTheme.Colour; }

	get gitPaths() {
		return [];
	}
}

export function getConfig(repo?: string) {
	return new Config(repo);
}
