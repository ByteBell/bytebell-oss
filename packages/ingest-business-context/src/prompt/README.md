# `prompt/` — context

Builds the system + user messages consumed by the LLM calls.

| File                 | Responsibility                                                                       |
| -------------------- | ------------------------------------------------------------------------------------ |
| `title-prompt.ts`    | System prompt for the title-generation call. Returns `{ "title": "…" }`.             |
| `analysis-prompt.ts` | System prompt for partial-fields analysis. Builds the JSON template from field-defs. |
| `user-message.ts`    | Composes the user message (text + title + enrichment) for analysis calls.            |

All prompt content stays here. Nothing else in the package builds prompts.
