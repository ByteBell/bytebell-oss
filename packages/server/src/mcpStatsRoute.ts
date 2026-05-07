import type { Request, Response, Router } from "express";
import express from "express";
import { getGlobalUsage, getMonthlyUsage } from "@bb/mongo";

export function buildMcpStatsRoute(): Router {
  const router = express.Router();

  router.get("/api/v1/mcp/stats", async (_req: Request, res: Response) => {
    try {
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth() + 1;

      const [globalStats, monthlyStats] = await Promise.all([getGlobalUsage(), getMonthlyUsage(year, month)]);

      res.status(200).json({
        global: globalStats[0] || {
          totalRequests: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalTokens: 0,
        },
        monthly: monthlyStats,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}
