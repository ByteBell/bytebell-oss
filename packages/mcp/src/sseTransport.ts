import type { Request, Response } from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

const POST_ENDPOINT = "/sse/messages";

const transports = new Map<string, SSEServerTransport>();

export async function handleSseConnect(_req: Request, res: Response, server: McpServer): Promise<void> {
  const transport = new SSEServerTransport(POST_ENDPOINT, res);
  transports.set(transport.sessionId, transport);
  res.on("close", () => {
    transports.delete(transport.sessionId);
  });
  // See note in streamableHttpTransport.ts — SDK Transport.onclose typing mismatch under
  // exactOptionalPropertyTypes; same widen-then-narrow at the connect boundary.
  await server.connect(transport as unknown as Transport);
}

export async function handleSseMessages(req: Request, res: Response): Promise<void> {
  const raw = req.query["sessionId"];
  const sessionId = typeof raw === "string" ? raw : undefined;
  const transport = sessionId === undefined ? undefined : transports.get(sessionId);
  if (transport === undefined) {
    res.status(400).json({ error: "no transport found for sessionId" });
    return;
  }
  await transport.handlePostMessage(req, res, req.body);
}

export async function closeAllSseTransports(): Promise<void> {
  const all = Array.from(transports.values());
  transports.clear();
  await Promise.allSettled(
    all.map(async (transport) => {
      await transport.close();
    }),
  );
}
