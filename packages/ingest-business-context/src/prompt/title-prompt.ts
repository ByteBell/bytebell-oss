/**
 * System prompt for the title-generation LLM call. Asks the model to read the
 * raw business-context text and return a single JSON object with one key,
 * `title`, holding a concise product-recognisable string.
 */
export function buildTitleGenerationPrompt(): string {
  return `You are a senior product manager generating a concise title for a business-context entry.

The user will provide raw text describing a piece of business context attached to a code commit.
Your task: produce ONE short, descriptive title that a product manager would recognise instantly
when scanning a list of business contexts.

Requirements:
- Maximum 12 words.
- No technical jargon. No code identifiers (no camelCase, no file paths, no function names).
- Product-domain language. Capture the *what* and the *audience*, not the *how*.
- If the text is empty or unintelligible, output the literal string "Untitled Business Context".

Output strictly as JSON: { "title": "<your title here>" }

No prose. No explanations. No markdown code fences.`;
}
