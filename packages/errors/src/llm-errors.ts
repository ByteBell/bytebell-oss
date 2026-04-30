export class LlmConfigError extends Error {
  override readonly name = "LlmConfigError";
  readonly hint: string;

  constructor(hint: string) {
    super(`OpenRouter API key is not configured. Run:\n  ${hint}`);
    this.hint = hint;
  }
}

export class LlmError extends Error {
  override readonly name = "LlmError";

  constructor(message: string, cause?: unknown) {
    super(message);
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}
