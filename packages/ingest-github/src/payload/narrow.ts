import type { GithubIndexPayload, LocalIngestPayload, PayloadLlmOverrides } from "@bb/types";
import { IngestError } from "@bb/errors";

/**
 * Copies optional LLM credential / model overrides from a payload record onto
 * a typed payload. Enterprise wrappers resolve per-org credentials at the
 * enqueue boundary and stamp them on the BullMQ payload; without this passthrough
 * the worker would always fall back to global config (and the resolver work is
 * wasted). OSS standalone leaves all four unset, so nothing happens here.
 */
function attachLlmOverrides(rec: Record<string, unknown>, target: PayloadLlmOverrides): void {
  const apiKey = rec["llmApiKey"];
  if (typeof apiKey === "string" && apiKey.length > 0) {
    target.llmApiKey = apiKey;
  }
  const provider = rec["llmProvider"];
  if (typeof provider === "string" && provider.length > 0) {
    target.llmProvider = provider;
  }
  const model = rec["llmModel"];
  if (typeof model === "string" && model.length > 0) {
    target.llmModel = model;
  }
  const keyId = rec["llmKeyId"];
  if (typeof keyId === "string" && keyId.length > 0) {
    target.llmKeyId = keyId;
  }
}

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
  attachLlmOverrides(rec, out);
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
  attachLlmOverrides(rec, out as PayloadLlmOverrides);
  return out;
}

export function isEnvelopeCoherent(jobKnowledgeId: string, payloadKnowledgeId: string): boolean {
  return jobKnowledgeId === payloadKnowledgeId;
}
