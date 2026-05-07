export enum JobType {
  GithubIndex = "github_index",
  GithubPull = "github_pull",
  LocalIngest = "local_ingest",
}

export enum JobPriority {
  Low = 0,
  Normal = 1,
  High = 2,
}

export interface GithubIndexPayload {
  knowledgeId: string;
  repoUrl: string;
  branch?: string;
  commitHash?: string;
  gitToken?: string;
}

export interface GithubPullPayload {
  knowledgeId: string;
  /**
   * Optional anchor for the commit the caller already resolved (CLI / route may pre-fetch HEAD).
   * The worker reads `git rev-parse HEAD` after clone regardless, but this field lets early
   * idempotency checks short-circuit before enqueue when the caller already knows HEAD.
   */
  latestCommitHash?: string;
  gitToken?: string;
}

export interface LocalIngestPayload {
  knowledgeId: string;
  rootDir: string;
}

export interface JobMessage<P> {
  id: string;
  type: JobType;
  priority: JobPriority;
  knowledgeId: string;
  attempt: number;
  createdAt: string;
  payload: P;
}

export type PayloadFor<T extends JobType> = T extends JobType.GithubIndex
  ? GithubIndexPayload
  : T extends JobType.GithubPull
    ? GithubPullPayload
    : T extends JobType.LocalIngest
      ? LocalIngestPayload
      : never;
