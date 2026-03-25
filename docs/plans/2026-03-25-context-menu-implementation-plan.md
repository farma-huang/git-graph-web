# Context Menu Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Modify the context menus for branches, remote branches, and commits to only show the specific options requested by the user.

**Architecture:** We will directly edit the context menu generator functions (`getBranchContextMenuActions`, `getRemoteBranchContextMenuActions`, `getCommitContextMenuActions`) in `web/main.ts` to filter out unrequested options.

**Tech Stack:** TypeScript, standard DOM manipulation

---

### Task 1: Restrict the Current Branch Context Menu

**Files:**
- Modify: `web/main.ts` (inside `getBranchContextMenuActions`)

**Step 1: Write minimal implementation**

```typescript
// Look for getBranchContextMenuActions.
// Modify the returned array to ONLY include:
// - "Rename Branch..."
// - "Push Branch..."
```

**Step 2: Commit**

```bash
git add web/main.ts
git commit -m "feat: restrict current branch context menu"
```

---

### Task 3: Restrict the Remote Branch Context Menu

**Files:**
- Modify: `web/main.ts` (inside `getRemoteBranchContextMenuActions`)

**Step 1: Write minimal implementation**

```typescript
// Look for getRemoteBranchContextMenuActions.
// Modify the returned array to ONLY include:
// - "Checkout Branch..."
// - "Delete Remote Branch..."
// - "Merge into current branch..."
// - "Pull into current branch..."
```

**Step 2: Commit**

```bash
git add web/main.ts
git commit -m "feat: restrict remote branch context menu"
```

---

### Task 4: Restrict the Commit Context Menu

**Files:**
- Modify: `web/main.ts` (inside `getCommitContextMenuActions`)

**Step 1: Write minimal implementation**

```typescript
// Look for getCommitContextMenuActions.
// Modify the returned array to ONLY include:
// - "Create Branch..."
// - "Checkout..."
// - "Cherry Pick..."
```

**Step 2: Commit**

```bash
git add web/main.ts
git commit -m "feat: restrict commit context menu"
```
