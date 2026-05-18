export interface RegisterGithubWorkersDeps {
  sourceFactory?: SourceFactory;
  pullFactory?: PullFactory;
  progressContextFactory?: ProgressContextFactory;
}

export type ProgressPhase = "file_analysis" | "folder_analysis" | "indexing";

export type ProgressTotalMode = { kind: "fixed"; total: number } | { kind: "growing"; initialTotal?: number };

export interface ProgressReporterInput {
  readonly phase: ProgressPhase;
  readonly subPhase?: string;
  readonly total: ProgressTotalMode;
  readonly resolveInitialProcessed?: () => Promise<number> | number;
}

export interface ProgressReporter {
  start(): Promise<void>;
  increment(delta?: number, meta?: { fileName?: string }): void;
  incrementSeen(delta?: number): void;
  setTotal(total: number): void;
  stop(): void;
}

export interface ProgressContext {
  reporter(input: ProgressReporterInput): ProgressReporter;
  phaseChanged(phase: ProgressPhase): void;
  completed(message?: string): void;
  failed(error: string, phase?: ProgressPhase): void;
}

export type ProgressContextFactory = (knowledgeId: string) => ProgressContext;

export declare const nullProgressContextFactory: ProgressContextFactory;

export declare function registerGithubWorkers(deps?: RegisterGithubWorkersDeps): void;
export declare function registerLocalIngestWorker(): void;

export interface FlatFolderStrategyDeps {
  fileAnalyzer: FileAnalyzer;
  progressContextFactory?: ProgressContextFactory;
}
export declare function createFlatFolderStrategy(deps: FlatFolderStrategyDeps): IngestStrategy;
export declare const createLlmFileAnalyzer: (...args: any[]) => any;
export declare const createDiskSourceReader: (...args: any[]) => any;
export declare const createPipelineRunner: (...args: any[]) => any;
export declare const createGithubIngestHandler: (...args: any[]) => any;
export declare const createLocalIngestHandler: (...args: any[]) => any;
export declare const runPull: (...args: any[]) => any;
export declare const reposRoot: (...args: any[]) => string;
export declare const repoCloneDir: (knowledgeId: string) => string;
export declare const metaRootFor: (knowledgeId: string) => string;
export declare const metaPathsFor: (knowledgeId: string) => unknown;
export declare const commitMetaDir: (knowledgeId: string, commitHash: string) => string;
export declare const businessContextDir: (knowledgeId: string, commitHash: string, sanitizedTitle: string) => string;
export declare const orgRegistryDir: (knowledgeId: string, orgId: string) => string;
export declare function fetchLatestCommitHash(
  repoUrl: string,
  branch: string,
  gitToken?: string,
): Promise<string | null>;
export declare function fetchRecentCommits(
  repoUrl: string,
  branch: string,
  limit?: number,
  gitToken?: string,
): Promise<FetchCommitsResult>;
export declare function fetchDefaultBranch(repoUrl: string, gitToken?: string): Promise<DefaultBranchResult>;
export declare function fetchBranches(
  repoUrl: string,
  gitToken?: string,
  limit?: number,
): Promise<{ status: "ok"; branches: string[] } | { status: "error"; message: string }>;
export declare function parseGithubRepo(repoUrl: string): ParsedRepo | null;

export interface BootstrapRuntimeOptions {
  config: unknown;
  loggerFactory: (scope: string) => unknown;
}
export declare function bootstrapRuntime(opts: BootstrapRuntimeOptions): Promise<void>;

export declare const COMBINED_CODE_ANALYSIS_SYSTEM_PROMPT: string;
export declare function buildFileAnalysisUserPrompt(input: { relativePath: string; content: string }): string;

export type CreatePipelineRunnerDeps = any;
export type IngestJobHandlerDeps = any;
export type IngestRunnerDeps = any;
export type IngestRunnerInput = any;
export type IngestStrategy = any;
export type StrategyInput = any;
export type StrategyResult = any;
export type StrategyContext = any;
export type FileAnalyzer = any;
export type AnalyzedFileResult = any;
export type ScanEntry = any;
export type ScannedFile = any;
export type OversizedFile = any;
export type ScanDeps = any;
export type SourceReader = any;
export type ArchiveSink = any;
export type ArchiveSinkInput = any;
export type SourceFactory = any;
export type SourceFactoryInput = any;
export type SourceFactoryResult = any;
export type PullFactory = any;
export type PullFactoryInput = any;
export type PullFactoryResult = any;
export type DiffResult = any;
export type RenamedFile = any;
export type CondensedFileAnalysis = any;
export interface CommitEntry {
  sha: string;
  message: string;
  author: string;
  timestamp: string;
}

export type FetchCommitsResult =
  | { status: "ok"; commits: CommitEntry[] }
  | { status: "not_found" }
  | { status: "unauthorized" }
  | { status: "rate_limited" }
  | { status: "error"; message: string };

export interface ParsedRepo {
  owner: string;
  repo: string;
  branch?: string;
}

export type DefaultBranchResult =
  | { status: "ok"; branch: string }
  | { status: "not_found" }
  | { status: "unauthorized" }
  | { status: "rate_limited" }
  | { status: "error"; message: string };
