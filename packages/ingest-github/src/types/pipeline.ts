import type { GithubIndexPayload } from "@bb/types";
import type { FileAnalysis } from "@bb/mongo";

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
}

export interface FileAnalyzer {
  analyze(input: { relativePath: string; content: string }): Promise<AnalyzedFileResult>;
}

export interface PipelineSummary {
  filesAnalyzed: number;
  foldersSummarised: number;
  repoSummarised: boolean;
  graphNodesWritten: number;
  commitHash: string;
}

export interface PipelineDeps {
  reposRootDir: string;
}

export interface ScanDeps {
  skipDecider?: SkipDecider;
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

export type SkipDecision = "accept" | "reject-static" | "reject-llm" | "accept-llm";

export interface SkipDeciderInput {
  relativePath: string;
  absolutePath: string;
  ext: string;
  /** Pre-loaded content. When set, the LLM branch uses this instead of reading absolutePath from disk. */
  content?: string;
}

export interface SkipDecider {
  decide(input: SkipDeciderInput): Promise<SkipDecision>;
}
