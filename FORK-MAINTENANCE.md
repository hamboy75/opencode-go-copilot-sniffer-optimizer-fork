# Fork Maintenance Guide

## Overview

This fork (`hamboy75/opencode-go-copilot-sniffer-optimizer-fork`) is based on **OnesoftQwQ/opencode-go-copilot** and adds the **LocalStats Sniffer & Optimizer** layer on top.

## Repository Structure

| Remote | URL | Purpose |
|--------|-----|---------|
| `origin` | `hamboy75/opencode-go-copilot-sniffer-optimizer-fork` | Your fork |
| `upstream` | `OnesoftQwQ/opencode-go-copilot` | Original project |

| Branch | Content |
|--------|---------|
| `master` | Upstream original (untouched) |
| `main` | Your changes (LocalStats + branding) |

## What We Changed

### New files (pure additions — zero impact on upstream code)

| File | Lines | Description |
|------|-------|-------------|
| `src/localStats/pruner.ts` | 241 | Request body pruning engine |
| `src/localStats/recorder.ts` | 199 | In-memory request recording |
| `src/localStats/server.ts` | 1727 | Local HTTP dashboard server |
| `src/localStats/types.ts` | 68 | LocalStats type definitions |
| `package.nls.es.json` | 77 | Spanish locale |

### Branding-only changes (just renamed settings prefix)

These files only changed `opencodego` → `opencodegosniffer` in config keys. **Zero logic modified.**

| File | Changes |
|------|---------|
| `src/commonApi.ts` | 1 setting renamed |
| `src/gitCommit/commitMessageGenerator.ts` | 9 settings renamed |
| `src/vision/imageProxy.ts` | 2 settings renamed |
| `src/zen/zenModels.ts` | 1 setting renamed |
| `src/provideModel.ts` | 1 setting renamed |

### Files with new code added (no existing logic removed)

| File | What was added |
|------|----------------|
| `src/extension.ts` | `LocalStatsServer` startup, OpenCode usage status bar, ~10 new commands |
| `src/provider.ts` | `applyRequestPruning()` function, `localStatsRecorder` integration (start/recordChunk/recordUsage/finish) |
| `src/localize.ts` | New translation strings for Sniffer UI |

### Docs/config files (replaced entirely)

| File | Description |
|------|-------------|
| `README.md` | Your custom README |
| `AGENTS.md` | Updated with LocalStats additions |
| `package.json` | Extension manifest with `opencodegosniffer` branding |
| `package.nls.json` | English locale strings |
| `package.nls.zh-cn.json` | Chinese locale strings |
| `assets/logo.png` | Your custom logo |

## How to Sync with Upstream

```bash
cd /home/pedro/opencode-go-copilot-fork

# 1. Fetch latest upstream changes
git fetch upstream

# 2. Merge upstream master into your main branch
git merge upstream/master

# 3. Resolve conflicts if any (see below for likely conflict areas)
# ... fix conflicts ...

# 4. Verify compilation
npx tsc --noEmit

# 5. Commit and push
git push origin main
```

## Likely Conflict Areas When Merging

When upstream makes changes, conflicts will most likely appear in:

| File | Why |
|------|-----|
| `src/extension.ts` | Both sides add new commands/imports |
| `src/provider.ts` | Both sides modify the request pipeline |
| `src/localize.ts` | Both sides add translation strings |
| `src/commonApi.ts` | Setting key renamed on our side |
| `src/gitCommit/commitMessageGenerator.ts` | Setting keys renamed on our side |
| `src/vision/imageProxy.ts` | Setting keys renamed on our side |
| `src/zen/zenModels.ts` | Setting keys + model list differ |
| `src/provideModel.ts` | Setting key renamed on our side |
| `package.json` | Both sides modify manifest |

### Conflict resolution strategy

1. **Setting keys**: Always keep `opencodegosniffer.*` (our prefix)
2. **Imports**: Keep both — upstream's new imports + our `localStats` imports
3. **New functions**: Keep both — upstream's new functions + our `applyRequestPruning` / `localStatsRecorder` calls
4. **Models**: Keep upstream's model list (they add/remove models over time)
5. **package.json**: Merge manually — keep our `name`, `publisher`, `displayName`, `commands`, `configuration` sections; accept upstream's dependency updates

## Files That Should NEVER Be Manually Edited

These files are owned by upstream and should only be updated via `git merge upstream/master`:

- `src/anthropic/anthropicApi.ts`
- `src/anthropic/anthropicTypes.ts`
- `src/openai/openaiApi.ts`
- `src/openai/openaiTypes.ts`
- `src/tokenizer/*`
- `src/gitCommit/gitUtils.ts`
- `src/statusBar.ts`
- `src/logger.ts`
- `src/versionManager.ts`
- `src/utils.ts`
- `src/provideToken.ts`
- `tsconfig.json`

## Build Commands

```bash
./build.sh           # install + compile
./build.sh compile   # compile only
./build.sh check     # type-check only
./build.sh package   # compile + create .vsix
./build.sh clean     # clean build artifacts
```
