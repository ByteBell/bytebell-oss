/**
 * Thrown when the worker is asked to attach a business context to a commit
 * whose files have not been indexed. The HTTP layer maps this to a 409.
 */
export class CommitNotIndexedError extends Error {
  readonly knowledgeId: string;
  readonly commitHash: string;

  constructor(knowledgeId: string, commitHash: string) {
    super(`Commit ${commitHash.substring(0, 12)} is not indexed for knowledge ${knowledgeId}`);
    this.name = "CommitNotIndexedError";
    this.knowledgeId = knowledgeId;
    this.commitHash = commitHash;
  }
}

/**
 * Thrown when every LLM analysis call returns null (no usable JSON). Distinct
 * from upstream LLM errors (rate limits, transport) which propagate as-is.
 */
export class BusinessContextAnalysisFailedError extends Error {
  readonly knowledgeId: string;
  readonly commitHash: string;

  constructor(knowledgeId: string, commitHash: string) {
    super(
      `All parallel LLM analysis calls returned null for knowledge ${knowledgeId} @ ${commitHash.substring(0, 12)}`,
    );
    this.name = "BusinessContextAnalysisFailedError";
    this.knowledgeId = knowledgeId;
    this.commitHash = commitHash;
  }
}
