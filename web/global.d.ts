declare global {

	/* Visual Studio Code API Types */

	function acquireVsCodeApi(): {
		getState: () => WebViewState | null,
		postMessage: (message: import('../server/types').RequestMessage) => void,
		setState: (state: WebViewState) => void
	};


	/* State Types */

	type Config = import('../server/types').GitGraphViewConfig;

	const initialState: import('../server/types').GitGraphViewInitialState;
	const globalState: import('../server/types').DeepReadonly<import('../server/types').GitGraphViewGlobalState>;
	const workspaceState: import('../server/types').DeepReadonly<import('../server/types').GitGraphViewWorkspaceState>;

	type AvatarImageCollection = { [email: string]: string };

	interface ExpandedCommit {
		index: number;
		commitHash: string;
		commitElem: HTMLElement | null;
		compareWithHash: string | null;
		compareWithElem: HTMLElement | null;
		commitDetails: import('../server/types').GitCommitDetails | null;
		fileChanges: ReadonlyArray<import('../server/types').GitFileChange> | null;
		fileTree: FileTreeFolder | null;
		avatar: string | null;
		codeReview: import('../server/types').CodeReview | null;
		lastViewedFile: string | null;
		loading: boolean;
		scrollTop: {
			summary: number,
			fileView: number
		};
		contextMenuOpen: {
			summary: boolean,
			fileView: number
		};
	}

	interface WebViewState {
		readonly currentRepo: string;
		readonly currentRepoLoading: boolean;
		readonly gitRepos: import('../server/types').GitRepoSet;
		readonly gitBranches: ReadonlyArray<string>;
		readonly gitBranchHead: string | null;
		readonly gitConfig: import('../server/types').GitRepoConfig | null;
		readonly gitRemotes: ReadonlyArray<string>;
		readonly gitStashes: ReadonlyArray<import('../server/types').GitStash>;
		readonly gitTags: ReadonlyArray<string>;
		readonly commits: import('../server/types').GitCommit[];
		readonly commitHead: string | null;
		readonly avatars: AvatarImageCollection;
		readonly currentBranches: string[] | null;
		readonly moreCommitsAvailable: boolean;
		readonly maxCommits: number;
		readonly onlyFollowFirstParent: boolean;
		readonly expandedCommit: ExpandedCommit | null;
		readonly scrollTop: number;
		readonly findWidget: import('./findWidget').FindWidgetState;
		readonly settingsWidget: import('./settingsWidget').SettingsWidgetState;
	}


	/* Commit Details / Comparison View File Tree Types */

	interface FileTreeFile {
		readonly type: 'file';
		readonly name: string;
		readonly index: number;
		reviewed: boolean;
	}

	interface FileTreeRepo {
		readonly type: 'repo';
		readonly name: string;
		readonly path: string;
	}

	interface FileTreeFolder {
		readonly type: 'folder';
		readonly name: string;
		readonly folderPath: string;
		readonly contents: FileTreeFolderContents;
		open: boolean;
		reviewed: boolean;
	}

	type FileTreeLeaf = FileTreeFile | FileTreeRepo;
	type FileTreeNode = FileTreeFolder | FileTreeLeaf;
	type FileTreeFolderContents = { [name: string]: FileTreeNode };


	/* Dialog & ContextMenu shared base Target interfaces */

	type TargetType = 'commit' | 'cdv' | 'ref' | 'repo';

	interface CommitOrRefTarget {
		type: 'commit' | 'ref' | 'cdv';
		elem: HTMLElement;
	}

	interface RepoTarget {
		type: 'repo';
	}

	interface CommitTarget extends CommitOrRefTarget {
		hash: string;
	}

	interface RefTarget extends CommitTarget {
		ref: string;
	}
}

export {};
