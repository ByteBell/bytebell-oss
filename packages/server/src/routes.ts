import type { Application } from "express";
import { mountMcp } from "@bb/mcp";
import { buildHealthRoute } from "./healthRoute.ts";
import { buildGithubIndexRoute } from "./githubIndexRoute.ts";
import { buildGithubProbeRoute } from "./githubProbeRoute.ts";
import { buildGithubPullRoute } from "./githubPullRoute.ts";
import { buildGithubCommitsRoute } from "./githubCommitsRoute.ts";
import { buildLocalIndexRoute } from "./localIndexRoute.ts";
import { buildReposRoute } from "./reposRoute.ts";
import { buildDeleteRoute } from "./deleteRoute.ts";
import { buildStatsRoute } from "./statsRoute.ts";
import { buildMcpStatsRoute } from "./mcpStatsRoute.ts";

export function registerRoutes(app: Application): void {
  app.use(buildHealthRoute());
  app.use(buildGithubIndexRoute());
  app.use(buildGithubProbeRoute());
  app.use(buildGithubPullRoute());
  app.use(buildGithubCommitsRoute());
  app.use(buildLocalIndexRoute());
  app.use(buildReposRoute());
  app.use(buildDeleteRoute());
  app.use(buildStatsRoute());
  app.use(buildMcpStatsRoute());
  mountMcp(app);
}
