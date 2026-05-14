import type { Request, Response, Router } from "express";
import express from "express";
import { KnowledgeState, type KnowledgeDoc } from "@bb/types";
import { upsertKnowledge } from "@bb/mongo";
import { upsertKnowledgeNode } from "@bb/neo4j";
import { enqueueGithubIndex } from "@bb/queue";

interface IndexBody {
  repoUrl?: unknown;
  branch?: unknown;
  gitToken?: unknown;
}

export function buildGithubIndexRoute(): Router {
  const router = express.Router();
  router.post("/api/v1/github/index", async (req: Request, res: Response) => {
    const body = req.body as IndexBody;
    if (typeof body.repoUrl !== "string" || body.repoUrl.length === 0) {
      res.status(400).json({ error: "repoUrl required" });
      return;
    }
    if (!/^https?:\/\//u.test(body.repoUrl)) {
      res.status(400).json({ error: "invalid repoUrl format" });
      return;
    }
    const repoUrl = body.repoUrl;
    const branch = typeof body.branch === "string" && body.branch.length > 0 ? body.branch : undefined;
    const gitToken = typeof body.gitToken === "string" && body.gitToken.length > 0 ? body.gitToken : undefined;

    const knowledgeId = crypto.randomUUID();
    const now = new Date();
    const doc: KnowledgeDoc = {
      knowledgeId,
      source: { kind: "github" },
      info: { repoUrl, ...(branch !== undefined ? { branch } : {}) },
      status: { state: KnowledgeState.Created },
      createdAt: now,
      updatedAt: now,
    };
    await upsertKnowledge(doc);
    await upsertKnowledgeNode(doc);
    const jobId = await enqueueGithubIndex({
      knowledgeId,
      repoUrl,
      ...(branch !== undefined ? { branch } : {}),
      ...(gitToken !== undefined ? { gitToken } : {}),
    });
    res.status(200).json({ knowledgeId, jobId });
  });
  return router;
}
