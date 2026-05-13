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
  orgId?: string;
}

export interface GithubPullPayload {
  knowledgeId: string;
  /**
   * Optional commit to re-index the knowledge to. Must be a 40-character hex SHA
   * and must be reachable from `origin/<knowledge.branch>`. When omitted, the
   * worker resolves the branch's HEAD after clone. Direction does not matter —
   * the orchestrator handles forward, backward, and sideways targets through
   * the same diff machinery. See `docs/pull-plan.md`.
   */
  targetCommitHash?: string;
  gitToken?: string;
}

export interface LocalIngestPayload {
  knowledgeId: string;
  rootDir: string;
  orgId?: string;
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
