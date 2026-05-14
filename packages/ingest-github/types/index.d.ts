export interface RegisterGithubWorkersDeps {
  sourceFactory?: SourceFactory;
  pullFactory?: PullFactory;
}

export declare function registerGithubWorkers(deps?: RegisterGithubWorkersDeps): void;
export declare function registerLocalIngestWorker(): void;

export declare const createFlatFolderStrategy: (...args: any[]) => any;
export declare const createLlmFileAnalyzer: (...args: any[]) => any;
export declare const createDiskSourceReader: (...args: any[]) => any;
export declare const createPipelineRunner: (...args: any[]) => any;
export declare const createGithubIngestHandler: (...args: any[]) => any;
export declare const createLocalIngestHandler: (...args: any[]) => any;
export declare const runPull: (...args: any[]) => any;
export declare const reposRoot: (...args: any[]) => string;
export declare const fetchLatestCommitHash: (...args: any[]) => any;
export declare const fetchRecentCommits: (...args: any[]) => any;
export declare const parseGithubRepo: (...args: any[]) => any;

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
export type CommitEntry = any;
export type FetchCommitsResult = any;
export type ParsedRepo = any;
