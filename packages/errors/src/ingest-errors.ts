export class GitCloneError extends Error {
  override readonly name = "GitCloneError";

  constructor(repoUrl: string, cause: unknown) {
    super(`git clone failed for ${redactUrl(repoUrl)}: ${describe(cause)}`);
    this.cause = cause;
  }
}

export class IngestError extends Error {
  override readonly name = "IngestError";
  readonly knowledgeId: string;

  constructor(knowledgeId: string, message: string, cause?: unknown) {
    super(`[knowledgeId=${knowledgeId}] ${message}`);
    this.knowledgeId = knowledgeId;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function redactUrl(url: string): string {
  return url.replace(/\/\/([^:]+):([^@]+)@/u, "//$1:***@");
}
