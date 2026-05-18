import type { Request, Response, Router } from "express";
import express from "express";
import { getKnowledge } from "@bb/mongo";
import { fetchRecentCommits } from "@bb/ingest-github";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 2000;

interface CommitsResponse {
  knowledgeId: string;
  branch: string;
  commits: Array<{
    hash: string;
    shortHash: string;
    subject: string;
    author: string;
    date: string;
  }>;
}

/**
 * `GET /api/v1/github/:knowledgeId/commits?limit=N` — return the most recent
 * N commits on the indexed branch via GitHub's REST API.
 *
 * Reads `Authorization: Bearer <pat>` if the client supplies one. Public
 * repos work unauthenticated; private repos answer 404 until a token is
 * provided, at which point the CLI re-requests with auth.
 *
 * Local clone state is intentionally not consulted — the picker should
 * work even if the clone is shallow, stale, or missing.
 */
export function buildGithubCommitsRoute(): Router {
  const router = express.Router();
  router.get("/api/v1/github/:knowledgeId/commits", async (req: Request, res: Response) => {
    const knowledgeId = req.params["knowledgeId"];
    if (typeof knowledgeId !== "string" || knowledgeId.length === 0) {
      res.status(400).json({ error: "knowledgeId required" });
      return;
    }
    const limitRaw = req.query["limit"];
    const limit = parseLimit(typeof limitRaw === "string" ? limitRaw : undefined);

    const knowledge = await getKnowledge(knowledgeId);
    if (knowledge === null) {
      res.status(404).json({ error: "knowledge not found" });
      return;
    }
    if (knowledge.source.kind !== "github") {
      res
        .status(422)
        .json({ error: `commits endpoint is only supported for github knowledge (kind=${knowledge.source.kind})` });
      return;
    }
    const branch = knowledge.info.branch ?? "main";
    const repoUrl = knowledge.info.repoUrl;
    if (repoUrl === undefined || repoUrl.length === 0) {
      res.status(422).json({ error: "commits endpoint requires knowledge.info.repoUrl" });
      return;
    }
    const gitToken = extractBearerToken(req.headers["authorization"]);

    const result = await fetchRecentCommits(repoUrl, branch, limit, gitToken);
    switch (result.status) {
      case "ok": {
        const commits = result.commits.map((c) => ({
          hash: c.sha,
          shortHash: c.sha.slice(0, 7),
          subject: c.message.split("\n")[0] ?? "",
          author: c.author,
          date: c.timestamp,
        }));
        const payload: CommitsResponse = { knowledgeId, branch, commits };
        res.status(200).json(payload);
        return;
      }
      case "not_found": {
        res
          .status(404)
          .json({ error: "repo not found or private; supply a github token via Authorization: Bearer <pat>" });
        return;
      }
      case "unauthorized": {
        res.status(401).json({ error: "github token rejected" });
        return;
      }
      case "rate_limited": {
        res.status(429).json({ error: "github rate limit reached; retry later or supply a token" });
        return;
      }
      case "error": {
        res.status(502).json({ error: result.message });
        return;
      }
    }
  });
  return router;
}

function parseLimit(raw: string | undefined): number {
  if (raw === undefined) {
    return DEFAULT_LIMIT;
  }
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(n, MAX_LIMIT);
}

function extractBearerToken(header: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw !== "string") {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/iu.exec(raw.trim());
  if (match === null) {
    return undefined;
  }
  const token = match[1]?.trim();
  return token !== undefined && token.length > 0 ? token : undefined;
}
