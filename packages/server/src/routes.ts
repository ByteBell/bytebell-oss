import type { Application } from "express";
import { mountMcp } from "@bb/mcp";
import { buildHealthRoute } from "./healthRoute.ts";
import { buildGithubIndexRoute } from "./githubIndexRoute.ts";
import { buildLocalIndexRoute } from "./localIndexRoute.ts";
import { buildReposRoute } from "./reposRoute.ts";

export function registerRoutes(app: Application): void {
  app.use(buildHealthRoute());
  app.use(buildGithubIndexRoute());
  app.use(buildLocalIndexRoute());
  app.use(buildReposRoute());
  mountMcp(app);
}
