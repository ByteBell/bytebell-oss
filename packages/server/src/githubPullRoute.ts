import type { Request, Response, Router } from "express";
import express from "express";
import { getKnowledge } from "@bb/mongo";
import { enqueueGithubPull } from "@bb/queue";
import { fetchLatestCommitHash } from "@bb/ingest-github";

interface PullBody {
  knowledgeId?: unknown;
  latestCommitHash?: unknown;
  gitToken?: unknown;
}

interface PullResponse {
  knowledgeId: string;
  jobId?: string;
  noOp?: boolean;
  commitHash?: string;
}

/**
 * `POST /api/v1/github/pull` — re-index a previously added GitHub repo at the
 * branch's current HEAD.
 *
 * Pre-fetches HEAD via the GitHub REST API when the caller doesn't supply
 * `latestCommitHash`. If that resolved SHA is already in the recorded
 * `commitHashes`, returns `{ noOp: true }` without enqueueing — the worker's
 * own idempotency check is the canonical guard, but bailing here saves a
 * round-trip through the queue.
 */
export function buildGithubPullRoute(): Router {
  const router = express.Router();
  router.post("/api/v1/github/pull", async (req: Request, res: Response) => {
    const body = req.body as PullBody;
    if (typeof body.knowledgeId !== "string" || body.knowledgeId.length === 0) {
      res.status(400).json({ error: "knowledgeId required" });
      return;
    }
    const knowledgeId = body.knowledgeId;
    const gitToken = typeof body.gitToken === "string" && body.gitToken.length > 0 ? body.gitToken : undefined;
    const suppliedCommit =
      typeof body.latestCommitHash === "string" && body.latestCommitHash.length > 0 ? body.latestCommitHash : undefined;

    const knowledge = await getKnowledge(knowledgeId);
    if (knowledge === null) {
      res.status(404).json({ error: "knowledge not found" });
      return;
    }
    if (knowledge.source.kind !== "github") {
      res.status(422).json({ error: `pull is only supported for github knowledge (kind=${knowledge.source.kind})` });
      return;
    }

    // Pre-fetch HEAD when the caller didn't supply one — best-effort, null on
    // transient API failure. Worker reads `git rev-parse HEAD` after clone for
    // the authoritative answer regardless.
    const branch = knowledge.source.branch ?? "main";
    const targetCommit =
      suppliedCommit ?? (await fetchLatestCommitHash(knowledge.source.repoUrl, branch, gitToken)) ?? undefined;

    // Early idempotency — skip enqueue when already at this commit.
    const recorded = knowledge.source.commitHashes ?? [];
    if (targetCommit !== undefined && recorded.includes(targetCommit)) {
      const response: PullResponse = { knowledgeId, noOp: true, commitHash: targetCommit };
      res.status(200).json(response);
      return;
    }

    const jobId = await enqueueGithubPull({
      knowledgeId,
      ...(targetCommit !== undefined ? { latestCommitHash: targetCommit } : {}),
      ...(gitToken !== undefined ? { gitToken } : {}),
    });
    const response: PullResponse = {
      knowledgeId,
      jobId,
      ...(targetCommit !== undefined ? { commitHash: targetCommit } : {}),
    };
    res.status(200).json(response);
  });
  return router;
}
