---
name: bytebell
description: >
  Bytebell-public local knowledge graph. Search, lookup, and retrieve from
  code repositories indexed locally by bytebell-server. TRIGGER when using:
  smart_search, keyword_lookup, retrieve_file.
user-invocable: true
argument-hint: "[search query or task description]"
---

# Bytebell-public knowledge graph

Single-tenant local engine. The graph is `Knowledge → File → (Keyword | Class | Function | Module)` — flat, no commit versioning, no multi-tenant scoping. Every `Knowledge` node carries a `repoName` (e.g. `anthropics/claude-code`) and a `knowledgeId` (UUID).

`knowledgeId` is **always** a UUID — never a repo name or slug. Get it from `smart_search` results or `keyword_lookup` results before passing it back into another tool.

## Tools

| Tool             | When to use                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `smart_search`   | Default — fuses six channels in one call (purpose, paths, keywords, classes, functions, imports)           |
| `keyword_lookup` | Find specific named entities — exact class names, function names, keywords, or imported modules            |
| `retrieve_file`  | Get file metadata (purpose, summary, classes/functions list) or content (line range or search-within-file) |

## Always-on guardrails

1. **`knowledgeId` is a UUID.** Never guess it from a repo name. Get it from `smart_search` or `keyword_lookup` output first.
2. **`metadata` before `content`.** Always call `retrieve_file` with `operation: "metadata"` before `operation: "content"`. The metadata response carries `classes[]` and `functions[]` whose signatures embed approximate line ranges (`"AuthService (~L12-58): handles login"`) — use those line ranges to target your content read instead of paginating blindly.
3. **Max 3 consecutive `retrieve_file` calls.** If you find yourself reading file after file without progress, stop and re-orient with `smart_search` or `keyword_lookup`. Three reads is usually enough to confirm or deny a hypothesis.
4. **Use `bulk_search`, not a loop.** When you need to find a string across many files, call `retrieve_file` with `operation: "bulk_search"` and an array of paths instead of N sequential `content+search` calls.
5. **No cross-repo cap.** Omitting `knowledgeId` searches every indexed repository. Use it freely; the response trims itself to a token budget.

## Per-task workflows

For code search, file location, and reading: read `bytebell-code-search.md`.

## What this server does NOT have

- PDF, image, or website tools — code only.
- Commit-aware retrieval — there is one snapshot per indexed repo.
- An LLM-based answer synthesizer (`generate_answer`) — write your own answer in chat.
- Conversation capture or feedback hooks — none.
- Auth — runs unauthenticated on `127.0.0.1`.
