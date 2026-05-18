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
  /** HTTP status code from the provider when the failure originated from a non-OK response. */
  readonly status?: number;
  /** Raw provider response body (or other structured detail), capped to a sane size by the thrower. */
  readonly detail?: string;

  constructor(message: string, cause?: unknown, options?: { status?: number; detail?: string }) {
    super(message);
    if (cause !== undefined) {
      this.cause = cause;
    }
    if (options?.status !== undefined) {
      this.status = options.status;
    }
    if (options?.detail !== undefined) {
      this.detail = options.detail;
    }
  }
}
