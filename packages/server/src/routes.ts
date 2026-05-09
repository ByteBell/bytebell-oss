import type { Application } from "express";
import { mountMcp } from "@bb/mcp";
import { buildHealthRoute } from "./healthRoute.ts";
import { buildGithubIndexRoute } from "./githubIndexRoute.ts";
import { buildGithubPullRoute } from "./githubPullRoute.ts";
import { buildLocalIndexRoute } from "./localIndexRoute.ts";
import { buildReposRoute } from "./reposRoute.ts";
import { buildDeleteRoute } from "./deleteRoute.ts";
import { buildStatsRoute } from "./statsRoute.ts";
import { buildMcpStatsRoute } from "./mcpStatsRoute.ts";
import { buildConfigRoute } from "./config/configRoute.ts";

export function registerRoutes(app: Application): void {
  app.use(buildHealthRoute());
  app.use(buildGithubIndexRoute());
  app.use(buildGithubPullRoute());
  app.use(buildLocalIndexRoute());
  app.use(buildReposRoute());
  app.use(buildDeleteRoute());
  app.use(buildStatsRoute());
  app.use(buildMcpStatsRoute());
  app.use(buildConfigRoute());
  mountMcp(app);
}
