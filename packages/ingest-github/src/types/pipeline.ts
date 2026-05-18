import type { GithubIndexPayload, GithubPullPayload } from "@bb/types";
import type { AskLlmOptions } from "@bb/llm";
import type { FileAnalysis } from "@bb/mongo";
import type { DiffResult } from "#src/pipeline/git-diff.ts";

export interface ScannedFile {
  kind: "file";
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  content: string;
}

export interface OversizedFile {
  kind: "oversized";
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
}

export type ScanEntry = ScannedFile | OversizedFile;

export interface AnalyzedFileResult {
  language: string;
  analysis: FileAnalysis;
  tokenUsage?: { inputTokens: number; outputTokens: number } | undefined;
}

export interface FileAnalyzer {
  analyze(input: {
    relativePath: string;
    content: string;
    /**
     * Per-job LLM credential overrides. When set, passed to `askJsonLLM` so
     * the file analysis uses the caller-supplied credentials instead of
     * `Config.OpenrouterApiKey`. Absent in OSS standalone.
     */
    llmCallContext?: AskLlmOptions;
  }): Promise<AnalyzedFileResult>;
}

export interface PipelineSummary {
  filesAnalyzed: number;
  foldersSummarised: number;
  repoSummarised: boolean;
  graphNodesWritten: number;
  commitHash: string;
  tokenUsage: { inputTokens: number; outputTokens: number };
}

export interface PipelineDeps {
  reposRootDir: string;
}

export interface ScanDeps {
  skipDecider?: SkipDecider;
  /**
   * Per-job LLM credential overrides forwarded to the skip-decider when it
   * invokes the LLM branch. Absent in OSS standalone runs.
   */
  llmCallContext?: AskLlmOptions;
}

export interface SourceReader {
  /** Iterate every scannable file in the repo, yielding ScanEntry. */
  scan(deps?: ScanDeps): AsyncGenerator<ScanEntry>;

  /** Read a single file by repo-relative path. Used by the big-file phase. */
  readFile(relativePath: string): Promise<string>;

  /** The resolved HEAD commit hash. Populated by the time the reader is returned. */
  readonly commitHash: string;

  /** A stable on-disk path for the cloned tree when the reader is disk-backed; `""` otherwise. */
  readonly localRepoDir: string;
}

export interface ArchiveSinkInput {
  knowledgeId: string;
  relativePath: string;
  content: string;
}

export interface ArchiveSink {
  /** Push a single file's content to an external store. Failures are non-fatal. */
  push(input: ArchiveSinkInput): Promise<void>;
}

export interface SourceFactoryInput {
  knowledgeId: string;
  payload: GithubIndexPayload;
  branch: string;
}

export interface SourceFactoryResult {
  source: SourceReader;
  commitHash: string;
  archiveSink?: ArchiveSink;
}

/**
 * Optional injection hook used by `registerGithubWorkers`. When provided, the
 * runner skips the default disk clone and uses the returned reader instead.
 * The hook is intentionally generic — it names a seam, not any specific
 * alternative implementation. See `docs/extension-points.md`.
 */
export type SourceFactory = (input: SourceFactoryInput) => Promise<SourceFactoryResult>;

export interface PullFactoryInput {
  knowledgeId: string;
  payload: GithubPullPayload;
  /** The commit currently anchored on the knowledge in Mongo. The factory diffs from here to `targetCommit`. */
  currentCommit: string;
  /** Branch the knowledge tracks. The factory resolves the target commit relative to this branch. */
  branch: string;
}

export interface PullFactoryResult {
  /** Reader pinned at the resolved target commit; used by every downstream phase for file I/O. */
  source: SourceReader;
  /** Files changed between `currentCommit` and the resolved target. Same shape as `git diff --name-status`. */
  diff: DiffResult;
  /** Resolved target commit hash. Either the payload's `targetCommitHash` or the branch HEAD chosen by the factory. */
  targetCommit: string;
  /** Optional non-fatal sink. When set, the strategy archives analysed content via `push` after each file. */
  archiveSink?: ArchiveSink;
}

/**
 * Optional injection hook used by `registerGithubWorkers` for pull jobs.
 * When provided, `runPull` skips `syncRepository` + `computePullDiff` +
 * `checkoutCommit` and uses the factory's reader + diff directly. The
 * open-source binary leaves this undefined and pull runs against a local
 * git clone via `node:child_process`.
 */
export type PullFactory = (input: PullFactoryInput) => Promise<PullFactoryResult>;

export type SkipDecision = "accept" | "reject-static" | "reject-llm" | "accept-llm";

export interface SkipDeciderInput {
  relativePath: string;
  absolutePath: string;
  ext: string;
  /** Pre-loaded content. When set, the LLM branch uses this instead of reading absolutePath from disk. */
  content?: string;
  /**
   * Per-job LLM credential overrides. When set and the decider invokes the
   * LLM branch, these credentials override `Config.OpenrouterApiKey`. Absent
   * in OSS standalone — the LLM branch falls back to the configured key.
   */
  llmCallContext?: AskLlmOptions;
}

export interface SkipDecider {
  decide(input: SkipDeciderInput): Promise<SkipDecision>;
}
