import type { Application, Request, Response } from "express";
import { buildMcpServer } from "./server.ts";
import { closeAllStreamableHttpTransports, handleStreamableHttp } from "./streamableHttpTransport.ts";
import { closeAllSseTransports, handleSseConnect, handleSseMessages } from "./sseTransport.ts";

let mounted = false;

export function mountMcp(app: Application): void {
  if (mounted) {
    return;
  }
  mounted = true;
  const buildServer = (): ReturnType<typeof buildMcpServer> => buildMcpServer();

  const streamable = (req: Request, res: Response): void => {
    handleStreamableHttp(req, res, buildServer).catch((cause: unknown) => {
      sendError(res, cause);
    });
  };
  app.post("/mcp", streamable);
  app.get("/mcp", streamable);
  app.delete("/mcp", streamable);

  app.get("/sse", (req: Request, res: Response): void => {
    handleSseConnect(req, res, buildServer).catch((cause: unknown) => {
      sendError(res, cause);
    });
  });
  app.post("/sse/messages", (req: Request, res: Response): void => {
    handleSseMessages(req, res).catch((cause: unknown) => {
      sendError(res, cause);
    });
  });
}

export async function closeAllMcpSessions(): Promise<void> {
  await Promise.all([closeAllStreamableHttpTransports(), closeAllSseTransports()]);
}

function sendError(res: Response, cause: unknown): void {
  if (res.headersSent) {
    return;
  }
  const message = cause instanceof Error ? cause.message : String(cause);
  res.status(500).json({ error: message });
}
