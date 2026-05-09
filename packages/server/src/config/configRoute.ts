import type { Request, Response, Router } from "express";
import { Router as createRouter, json } from "express";
import { Config } from "@bb/types";
import { loadConfig, setConfigValue } from "@bb/config";
import type { ConfigValue } from "@bb/config";
import { renderConfigEditorHtml } from "./configEditorTemplate.ts";

export function buildConfigRoute(): Router {
  const router = createRouter();
  router.use(json());

  router.get("/config", (_req: Request, res: Response) => {
    const config = loadConfig();
    const html = renderConfigEditorHtml(config);
    res.send(html);
  });

  router.post("/config/save", (req: Request, res: Response) => {
    try {
      const updates = req.body as Record<string, unknown>;
      for (const [key, value] of Object.entries(updates)) {
        setConfigValue(key as Config, value as ConfigValue<Config>);
      }
      res.json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  return router;
}
