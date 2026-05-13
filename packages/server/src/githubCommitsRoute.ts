import type { Request, Response, Router } from "express";
import express from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { stat } from "node:fs/promises";
import { getKnowledge } from "@bb/mongo";
import { getBytebellHome } from "@bb/config";

const exec = promisify(execFile);

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 2000;

interface CommitEntry {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
}

interface CommitsResponse {
  knowledgeId: string;
  branch: string;
  commits: CommitEntry[];
}

/**
 * `GET /api/v1/github/:knowledgeId/commits?limit=N` — return the most recent
 * N commits on the indexed branch's history from the local clone. Used by the
 * CLI commit picker so the user can target any commit in `bytebell pull`.
 *
 * Reads from the local clone at `~/.bytebell/repos/<knowledgeId>`. Runs
 * `git fetch origin <branch>` first so the local refs are up to date with
 * whatever has been pushed since the last ingest. Then runs
 * `git log origin/<branch> -n <limit>` with a stable separator format.
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
    const branch = knowledge.source.branch ?? "main";
    const repoDir = path.join(getBytebellHome(), "repos", knowledgeId);

    try {
      await stat(path.join(repoDir, ".git"));
    } catch {
      res.status(404).json({ error: "local clone not found; re-index the knowledge to recreate it" });
      return;
    }

    try {
      await exec("git", ["-C", repoDir, "fetch", "origin", branch], { timeout: 30_000 });
    } catch {
      // Non-fatal: proceed with whatever the local clone has.
    }

    let stdout: string;
    try {
      const result = await exec(
        "git",
        [
          "-C",
          repoDir,
          "log",
          `origin/${branch}`,
          `--max-count=${limit}`,
          "--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%aI",
        ],
        { maxBuffer: 16 * 1024 * 1024 },
      );
      stdout = result.stdout;
    } catch (cause: unknown) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      res.status(500).json({ error: `git log failed: ${msg}` });
      return;
    }

    const commits: CommitEntry[] = [];
    for (const line of stdout.split("\n")) {
      if (line.length === 0) {
        continue;
      }
      const parts = line.split("\x1f");
      const hash = parts[0];
      const shortHash = parts[1];
      const subject = parts[2];
      const author = parts[3];
      const date = parts[4];
      if (
        hash === undefined ||
        shortHash === undefined ||
        subject === undefined ||
        author === undefined ||
        date === undefined
      ) {
        continue;
      }
      commits.push({ hash, shortHash, subject, author, date });
    }
    const payload: CommitsResponse = { knowledgeId, branch, commits };
    res.status(200).json(payload);
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
