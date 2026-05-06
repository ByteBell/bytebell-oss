import type { Request, Response, Router } from "express";
import express from "express";
import { deleteKnowledge } from "@bb/mongo";
import { deleteKnowledgeGraph } from "@bb/neo4j";
import { removeKnowledgeJobs } from "@bb/queue";
import { KnowledgeNotFoundError } from "@bb/errors";

export function buildDeleteRoute(): Router {
  const router = express.Router();
  router.delete("/api/v1/repos/:knowledgeId", async (req: Request, res: Response) => {
    const knowledgeId = req.params["knowledgeId"];
    if (typeof knowledgeId !== "string" || knowledgeId.length === 0) {
      res.status(400).json({ error: "knowledgeId required" });
      return;
    }

    const removedJobs = await removeKnowledgeJobs(knowledgeId).catch(() => ({ removed: 0 }));

    try {
      await deleteKnowledgeGraph(knowledgeId);
    } catch (cause: unknown) {
      res.status(500).json({ error: `neo4j delete failed: ${describe(cause)}`, step: "neo4j" });
      return;
    }

    let mongoResult: Awaited<ReturnType<typeof deleteKnowledge>>;
    try {
      mongoResult = await deleteKnowledge(knowledgeId);
    } catch (cause: unknown) {
      if (cause instanceof KnowledgeNotFoundError) {
        res.status(404).json({ error: cause.message });
        return;
      }
      res.status(500).json({ error: `mongo delete failed: ${describe(cause)}`, step: "mongo" });
      return;
    }

    res.status(200).json({
      knowledgeId,
      jobsRemoved: removedJobs.removed,
      mongoDeleted: mongoResult.knowledgeDeleted,
      rawDeleted: mongoResult.rawDeleted,
      statsDeleted: mongoResult.statsDeleted,
    });
  });
  return router;
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
