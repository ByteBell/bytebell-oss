import type { Request, Response, Router } from "express";
import express from "express";
import { aggregateStats } from "@bb/mongo";

export function buildStatsRoute(): Router {
  const router = express.Router();
  router.get("/api/v1/stats", async (_req: Request, res: Response) => {
    const stats = await aggregateStats();
    res.status(200).json(stats);
  });
  return router;
}
