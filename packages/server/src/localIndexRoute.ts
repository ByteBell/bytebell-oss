import type { Request, Response, Router } from "express";
import express from "express";
import { stat, mkdir } from "node:fs/promises";
import path from "node:path";
import { KnowledgeState, type KnowledgeDoc } from "@bb/types";
import { getBytebellHome } from "@bb/config";
import { upsertKnowledge } from "@bb/mongo";
import { upsertKnowledgeNode } from "@bb/neo4j";
import { enqueueLocalIngest } from "@bb/queue";
import { copyRepo } from "./copyRepo.ts";

interface LocalIndexBody {
  sourcePath?: unknown;
}

export function buildLocalIndexRoute(): Router {
  const router = express.Router();
  router.post("/api/v1/local/index", async (req: Request, res: Response) => {
    const body = req.body as LocalIndexBody;
    if (typeof body.sourcePath !== "string" || body.sourcePath.length === 0) {
      res.status(400).json({ error: "sourcePath required" });
      return;
    }
    const sourcePath = body.sourcePath;
    if (!path.isAbsolute(sourcePath)) {
      res.status(422).json({ error: "sourcePath must be absolute" });
      return;
    }
    try {
      const s = await stat(sourcePath);
      if (!s.isDirectory()) {
        res.status(400).json({ error: "not a directory" });
        return;
      }
    } catch {
      res.status(400).json({ error: "path does not exist" });
      return;
    }

    const knowledgeId = crypto.randomUUID();
    const reposRoot = path.join(getBytebellHome(), "repos");
    await mkdir(reposRoot, { recursive: true, mode: 0o700 });
    const destDir = path.join(reposRoot, knowledgeId);

    await copyRepo(sourcePath, destDir);

    const now = new Date();
    const doc: KnowledgeDoc = {
      knowledgeId,
      source: { kind: "local", sourcePath },
      info: {},
      status: { state: KnowledgeState.Created },
      createdAt: now,
      updatedAt: now,
    };
    await upsertKnowledge(doc);
    await upsertKnowledgeNode(doc);
    const jobId = await enqueueLocalIngest({ knowledgeId, rootDir: destDir });
    res.status(200).json({ knowledgeId, jobId });
  });
  return router;
}
