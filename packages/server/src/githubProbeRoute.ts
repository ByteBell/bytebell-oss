import type { Request, Response, Router } from "express";
import express from "express";
import { fetchDefaultBranch, fetchBranches } from "@bb/ingest-github";

interface ProbeBody {
  repoUrl?: unknown;
  gitToken?: unknown;
  branch?: unknown;
}

export function buildGithubProbeRoute(): Router {
  const router = express.Router();
  router.post("/api/v1/github/probe", async (req: Request, res: Response) => {
    const body = req.body as ProbeBody;
    if (typeof body.repoUrl !== "string" || body.repoUrl.length === 0) {
      res.status(400).json({ error: "repoUrl required" });
      return;
    }
    const repoUrl = body.repoUrl;
    const gitToken = typeof body.gitToken === "string" && body.gitToken.length > 0 ? body.gitToken : undefined;
    const targetBranch = typeof body.branch === "string" && body.branch.length > 0 ? body.branch : undefined;

    const result = await fetchDefaultBranch(repoUrl, gitToken);
    switch (result.status) {
      case "ok": {
        const defaultBranch = result.branch;
        const branchesResult = await fetchBranches(repoUrl, gitToken);
        const branches = branchesResult.status === "ok" ? branchesResult.branches : [];

        if (targetBranch !== undefined && !branches.includes(targetBranch)) {
          const suggestions = branches
            .filter((b: string) => b.toLowerCase().includes(targetBranch.toLowerCase()))
            .slice(0, 10);
          res.status(404).json({
            status: "branch_not_found",
            message: `Branch '${targetBranch}' not found.`,
            branches: suggestions.length > 0 ? suggestions : branches.slice(0, 20),
          });
          return;
        }

        res.status(200).json({ status: "ok", defaultBranch, branches });
        break;
      }
      case "not_found":
        res.status(404).json({ status: "not_found", message: "Repository not found or private." });
        break;
      case "unauthorized":
        res.status(401).json({ status: "unauthorized", message: "GitHub token rejected." });
        break;
      case "rate_limited":
        res.status(429).json({ status: "rate_limited", message: "GitHub rate limit reached." });
        break;
      case "error":
        res.status(502).json({ status: "error", message: result.message });
        break;
    }
  });
  return router;
}
