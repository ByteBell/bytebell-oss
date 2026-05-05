import type { Request, Response } from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

const POST_ENDPOINT = "/sse/messages";

interface SessionEntry {
  transport: SSEServerTransport;
  server: McpServer;
}

const sessions = new Map<string, SessionEntry>();

export async function handleSseConnect(_req: Request, res: Response, buildServer: () => McpServer): Promise<void> {
  const server = buildServer();
  const transport = new SSEServerTransport(POST_ENDPOINT, res);
  sessions.set(transport.sessionId, { transport, server });
  res.on("close", () => {
    sessions.delete(transport.sessionId);
    void server.close().catch(() => undefined);
  });
  // See note in streamableHttpTransport.ts — SDK Transport.onclose typing mismatch under
  // exactOptionalPropertyTypes; same widen-then-narrow at the connect boundary.
  await server.connect(transport as unknown as Transport);
}

export async function handleSseMessages(req: Request, res: Response): Promise<void> {
  const raw = req.query["sessionId"];
  const sessionId = typeof raw === "string" ? raw : undefined;
  const entry = sessionId === undefined ? undefined : sessions.get(sessionId);
  if (entry === undefined) {
    res.status(400).json({ error: "no transport found for sessionId" });
    return;
  }
  await entry.transport.handlePostMessage(req, res, req.body);
}

export async function closeAllSseTransports(): Promise<void> {
  const all = Array.from(sessions.values());
  sessions.clear();
  await Promise.allSettled(
    all.map(async (entry) => {
      await entry.transport.close();
      await entry.server.close();
    }),
  );
}
