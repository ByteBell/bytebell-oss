import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

const sessions = new Map<string, SessionEntry>();

export async function handleStreamableHttp(req: Request, res: Response, buildServer: () => McpServer): Promise<void> {
  const transport = await resolveTransport(req, buildServer);
  if (transport === undefined) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: no valid session and not an initialize call" },
      id: null,
    });
    return;
  }
  await transport.handleRequest(req, res, req.body);
}

export async function closeAllStreamableHttpTransports(): Promise<void> {
  const all = Array.from(sessions.values());
  sessions.clear();
  await Promise.allSettled(
    all.map(async (entry) => {
      await entry.transport.close();
      await entry.server.close();
    }),
  );
}

async function resolveTransport(
  req: Request,
  buildServer: () => McpServer,
): Promise<StreamableHTTPServerTransport | undefined> {
  const headerValue = req.headers["mcp-session-id"];
  const sessionId = typeof headerValue === "string" ? headerValue : undefined;

  if (sessionId !== undefined) {
    return sessions.get(sessionId)?.transport;
  }
  if (req.method === "POST" && isInitializeRequest(req.body)) {
    return createSession(buildServer());
  }
  return undefined;
}

async function createSession(server: McpServer): Promise<StreamableHTTPServerTransport> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (newSessionId: string) => {
      sessions.set(newSessionId, { transport, server });
    },
  });
  transport.onclose = (): void => {
    const closingId = transport.sessionId;
    if (typeof closingId === "string") {
      sessions.delete(closingId);
    }
    void server.close().catch(() => undefined);
  };
  // SDK declares Transport.onclose as `?: () => void` but the implementing class types it as
  // `(() => void) | undefined`; the two are incompatible under exactOptionalPropertyTypes.
  await server.connect(transport as unknown as Transport);
  return transport;
}
