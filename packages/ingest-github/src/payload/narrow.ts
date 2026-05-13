import type { GithubIndexPayload, LocalIngestPayload } from "@bb/types";
import { IngestError } from "@bb/errors";

export function narrowGithubIngest(knowledgeId: string, payload: unknown): GithubIndexPayload {
  if (typeof payload !== "object" || payload === null) {
    throw new IngestError(knowledgeId, "github_index payload must be an object");
  }
  const rec = payload as Record<string, unknown>;
  const kid = rec["knowledgeId"];
  const repoUrl = rec["repoUrl"];
  if (typeof kid !== "string" || kid.length === 0) {
    throw new IngestError(knowledgeId, "github_index payload missing knowledgeId");
  }
  if (typeof repoUrl !== "string" || repoUrl.length === 0) {
    throw new IngestError(knowledgeId, "github_index payload missing repoUrl");
  }
  const out: GithubIndexPayload = { knowledgeId: kid, repoUrl };
  const branch = rec["branch"];
  if (typeof branch === "string" && branch.length > 0) {
    out.branch = branch;
  }
  const commitHash = rec["commitHash"];
  if (typeof commitHash === "string" && commitHash.length > 0) {
    out.commitHash = commitHash;
  }
  const gitToken = rec["gitToken"];
  if (typeof gitToken === "string" && gitToken.length > 0) {
    out.gitToken = gitToken;
  }
  const orgId = rec["orgId"];
  if (typeof orgId === "string" && orgId.length > 0) {
    out.orgId = orgId;
  }
  return out;
}

export function narrowLocalIngest(knowledgeId: string, payload: unknown): LocalIngestPayload {
  if (typeof payload !== "object" || payload === null) {
    throw new IngestError(knowledgeId, "local_ingest payload must be an object");
  }
  const rec = payload as Record<string, unknown>;
  const kid = rec["knowledgeId"];
  const rootDir = rec["rootDir"];
  if (typeof kid !== "string" || kid.length === 0) {
    throw new IngestError(knowledgeId, "local_ingest payload missing knowledgeId");
  }
  if (typeof rootDir !== "string" || rootDir.length === 0) {
    throw new IngestError(knowledgeId, "local_ingest payload missing rootDir");
  }
  const out: LocalIngestPayload = { knowledgeId: kid, rootDir };
  const orgId = rec["orgId"];
  if (typeof orgId === "string" && orgId.length > 0) {
    out.orgId = orgId;
  }
  return out;
}

export function isEnvelopeCoherent(jobKnowledgeId: string, payloadKnowledgeId: string): boolean {
  return jobKnowledgeId === payloadKnowledgeId;
}
