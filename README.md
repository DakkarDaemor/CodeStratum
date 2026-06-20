# CodeStratum

> VS Code extension that indexes your codebase semantically, then splits AI coding tasks into a **plan** (reasoning model) and **execution** (cheap model) — reducing GitHub Copilot token costs without sacrificing quality.

---

## The problem

GitHub Copilot Business bills by token (per-token billing launched June 2026). Agentic sessions on large codebases are expensive because:

- The model receives thousands of lines of raw source it doesn't need
- Every task uses the most powerful (most expensive) model regardless of complexity
- There's no separation between *understanding the problem* and *writing the code*

## The solution

CodeStratum separates the workflow into three phases:

```
Init → Plan → Execute
```

| Phase | What happens | Model used |
|-------|-------------|------------|
| **Init** | AST-parses your project, annotates each module with a 12-word semantic summary | `gpt-5-mini` (once, cached) |
| **Plan** | Reads the compressed index + your task → produces a list of atomic steps | `claude-sonnet-4-6` (reasoning) |
| **Execute** | Runs each atomic step in series against only the relevant file | `gpt-5.3-codex` (per step) |

Instead of feeding 50,000 tokens of source to a reasoning model for every request, the planner receives a compressed semantic map (~2,000 tokens). The executor receives only the target file.

---

## Quick start

```bash
git clone https://github.com/DakkarDaemor/CodeStratum
cd CodeStratum
npm install
npm run compile
```

Open the folder in VS Code and press `F5` to launch the Extension Development Host.

**Requirements:** GitHub Copilot Business or Pro+ plan (model access via `vscode.lm` API).

---

## Usage

**First time (or after significant changes):**

`Ctrl+Shift+P` → `CodeStratum: Init`

This generates two files in your project root:

| File | Purpose |
|------|---------|
| `stratum.json` | Machine-readable semantic index (used by the extension) |
| `stratum.md` | Human-readable module map (committable as living documentation) |

**Daily workflow:**

1. Open the CodeStratum panel from the Activity Bar
2. Type what you want to do
3. Review the generated task list — edit or deselect steps
4. Click **Execute Selected**

**Check for stale index:**

`Ctrl+Shift+P` → `CodeStratum: Status`

---

## Commands

| Command | Description |
|---------|-------------|
| `CodeStratum: Init` | Index + annotate project, generate `stratum.json` |
| `CodeStratum: Status` | Show files modified since last index |
| `CodeStratum: Open Panel` | Open the main panel |

---

## Architecture

This section is for anyone interested in the technical decisions behind the project.

### Why three phases instead of one?

Most AI coding tools send the full codebase + task to a single powerful model. This works but is expensive and slow on large projects. CodeStratum applies a **planner/executor split**:

- The **planner** needs to understand architecture, dependencies, and task decomposition — this requires a reasoning model, but only needs a compressed representation of the codebase, not the source.
- The **executor** needs to write correct code for a single, well-defined task — this doesn't require reasoning, so a cheap model is sufficient.

The cost of the planner call is amortised across N executor calls.

### The semantic index (stratum.json)

Built in two steps:

1. **AST parsing** (`ts-morph`) — extracts exports, imports, file type, complexity, and a hash for change detection. Zero LLM cost.
2. **Semantic annotation** — `gpt-4o-mini` receives only function/class signatures (not implementations) and produces a 12-word summary per module. Cached until the file changes.

The index is intentionally shallow — it captures *what* each module does and *how modules relate*, not implementation details. This is what the planner needs.

### Change detection

Each module entry stores an MD5 hash of its content. `CodeStratum: Status` compares live hashes against the index and reports drift. No background watchers — explicit and predictable.

### Model selection

Models are selected via `vscode.lm.selectChatModels()` — the VS Code Language Model API that Copilot exposes. This means:

- No API keys required
- Works within Copilot Business plan model access
- Model availability depends on the user's plan

| Phase | Target family | Fallback behaviour |
|-------|-------------|-------------------|
| Annotator | `gpt-5-mini` | Skips annotation, uses type+exports as summary |
| Planner | `claude-sonnet-4-6` | Falls back to `gpt-5.4` if unavailable |
| Executor | `gpt-5.3-codex` | Falls back to `gpt-5-mini` |

### Panel UI

The webview panel is intentionally approval-first: the planner output is shown as an editable, selectable checklist before any code is written. This keeps the developer in control and avoids silent failures from incorrect task decomposition.

---

## Limitations

- TypeScript/JavaScript projects only (indexer uses `ts-morph`)
- Model availability depends on your Copilot plan
- No parallel execution (intentional — serial is safer and easier to review)

## Roadmap

- [x] Apply executor output directly to files via VS Code workspace edits
- [ ] Incremental re-indexing (re-annotate only changed files)
- [ ] Support for Python projects (via AST alternative)
- [ ] `stratum.json` as shared input for other tools (e.g. code-review-graph)

---

## License

MIT
