import { Config } from "@bb/types";
import { getConfigValue } from "@bb/config";

const REQUEST_TIMEOUT_MS = 5_000;
const LONG_REQUEST_TIMEOUT_MS = 30_000;

export function baseUrl(): string {
  const port = getConfigValue(Config.ServerPort);
  return `http://127.0.0.1:${port}`;
}

export class HttpClientError extends Error {
  override readonly name = "HttpClientError";
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    if (status !== undefined) {
      this.status = status;
    }
  }
}

export async function postJson<T>(routePath: string, body: object): Promise<T> {
  const url = `${baseUrl()}${routePath}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause: unknown) {
    throw new HttpClientError(`request failed: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  return parseResponse<T>(res);
}

export async function getJson<T>(routePath: string): Promise<T> {
  const url = `${baseUrl()}${routePath}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause: unknown) {
    throw new HttpClientError(`request failed: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  return parseResponse<T>(res);
}

export async function deleteJson<T>(routePath: string): Promise<T> {
  const url = `${baseUrl()}${routePath}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "DELETE",
      signal: AbortSignal.timeout(LONG_REQUEST_TIMEOUT_MS),
    });
  } catch (cause: unknown) {
    throw new HttpClientError(`request failed: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  return parseResponse<T>(res);
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: unknown };
      if (typeof parsed.error === "string") {
        message = parsed.error;
      }
    } catch {
      if (text.length > 0) {
        message = text.slice(0, 500);
      }
    }
    throw new HttpClientError(message, res.status);
  }
  return (await res.json()) as T;
}
