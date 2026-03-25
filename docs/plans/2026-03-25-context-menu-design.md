# Brainstorming Context Menu Features

## Context & Understanding
The user wants to implement custom context menus for specific elements in the Git Graph Web UI:
1. **Current Branch** (`.gitRef.head.active`): "Rename branch", "Push branch"
2. **Remote Branch** (`.gitRef.remote`): "Checkout branch", "Delete remote branch", "Merge in to current branch", "Pull into current branch"
3. **Commit** (`.commit td`): "Create branch", "Checkout", "Cherry pick"

Currently, the `git-graph-web` core code already contains large context menus for these elements (e.g. `getBranchContextMenuActions`, `getRemoteBranchContextMenuActions`, `getCommitContextMenuActions`) with many more options (Archive, Delete, Rebase, etc.). The underlying backend commands are also implemented.
To fulfill the user's specific requirement, we need to modify these menus to ONLY show the requested options for the specified elements, ensuring that the backend execution handlers for these specific actions remain functional.

## Approaches

### Approach 1: Directly modify the existing Context Menu builder functions (Recommended)
We can directly edit `web/main.ts` to restrict the returned `ContextMenuActions`:
- In `getBranchContextMenuActions`, if the branch is the current HEAD (`this.gitBranchHead === refName`), return ONLY the "Rename branch" and "Push branch" items.
- In `getRemoteBranchContextMenuActions`, return ONLY the items "Checkout branch", "Delete remote branch", "Merge into current branch", and "Pull into current branch".
- In `getCommitContextMenuActions`, return ONLY "Create branch", "Checkout", and "Cherry pick".

**Trade-offs:** 
- *Pros:* Direct, simple, completely fulfills the user's request, removes clutter that the user doesn't want.
- *Cons:* Hardcodes this specific behavior, removing access to other Git Graph features (like Rebase, Drop, Revert) from the context menu.

### Approach 2: Add a "Simplified Context Menu" configuration
We could add a new toggle in `server/config.ts` (e.g. `simplifiedContextMenus: true`) and in `web/main.ts`, conditionally render either the full original menu or the restricted menu.

**Trade-offs:**
- *Pros:* Keeps the original features intact for power users.
- *Cons:* Over-complicates the implementation for a feature the user explicitly requested as the primary behavior.

### Recommendation
**Approach 1** is recommended. The user specifically asked to implement these exact context menus on these elements, implying they want a customized, streamlined version of Git Graph for their web app without the cognitive overload of the full VS Code extension menus.

## Section-by-Section Design for Approach 1

### 1. Current Branch Context Menu (`gitRef head active`)
Modify `getBranchContextMenuActions` in `web/main.ts`. Check if `this.gitBranchHead === target.ref`. If so, return an array with only:
- "Rename Branch" (triggers `dialog.showRefInput` -> `renameBranch`)
- "Push Branch" (triggers `dialog.showForm` -> `pushBranch`)

### 2. Remote Branch Context Menu (`gitRef remote`)
Modify `getRemoteBranchContextMenuActions` in `web/main.ts` to return an array with only:
- "Checkout Branch" (triggers `checkoutBranchAction`)
- "Delete Remote Branch" (triggers `deleteRemoteBranch`)
- "Merge into current branch" (triggers `mergeAction`)
- "Pull into current branch" (triggers `pullBranch`)

### 3. Commit Context Menu (`.commit` rows)
Modify `getCommitContextMenuActions` in `web/main.ts` to return an array with only:
- "Create Branch" (triggers `createBranchAction`)
- "Checkout" (triggers `checkoutCommit`)
- "Cherry Pick" (triggers `cherrypickCommit`)

The execution handlers and backend commands for all these items already exist and are fully functional, so the work is exclusively frontend UI reduction.
