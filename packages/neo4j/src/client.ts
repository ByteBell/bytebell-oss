import { auth, driver as createDriver, int, type Driver, type Integer, type Session } from "neo4j-driver";
import { getConfigValue } from "@bb/config";
import { Config } from "@bb/types";
import { Neo4jConfigError, Neo4jConnectError, Neo4jNotConnectedError } from "@bb/errors";

export interface PingResult {
  ok: boolean;
  latencyMs: number;
}

let driver: Driver | null = null;
let connecting: Promise<void> | null = null;

export async function connectNeo4j(): Promise<void> {
  if (driver !== null) {
    return;
  }
  if (connecting !== null) {
    return connecting;
  }
  connecting = doConnect().finally(() => {
    connecting = null;
  });
  return connecting;
}

async function doConnect(): Promise<void> {
  const uri = getConfigValue(Config.Neo4jUri);
  const user = getConfigValue(Config.Neo4jUser);
  const password = getConfigValue(Config.Neo4jPassword);
  if (uri.length === 0) {
    throw new Neo4jConfigError("bytebell set neo4j <uri>");
  }
  if (user.length === 0 || password.length === 0) {
    throw new Neo4jConfigError("bytebell set neo4j-user <user> && bytebell set neo4j-password <pwd>");
  }
  const next = createDriver(uri, auth.basic(user, password));
  try {
    await next.verifyConnectivity();
  } catch (cause: unknown) {
    await next.close().catch(() => undefined);
    throw new Neo4jConnectError(uri, cause);
  }
  driver = next;
}

export async function closeNeo4j(): Promise<void> {
  if (driver === null) {
    return;
  }
  const d = driver;
  driver = null;
  await d.close();
}

export async function pingNeo4j(): Promise<PingResult> {
  const d = _getDriver();
  const start = performance.now();
  try {
    await d.verifyConnectivity();
    return { ok: true, latencyMs: Math.round(performance.now() - start) };
  } catch {
    return { ok: false, latencyMs: Math.round(performance.now() - start) };
  }
}

export function _getDriver(): Driver {
  if (driver === null) {
    throw new Neo4jNotConnectedError();
  }
  return driver;
}

export async function _runCypher<T = unknown>(query: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const session: Session = _getDriver().session();
  try {
    const result = await session.run(query, params);
    return result.records.map((r) => r.toObject() as T);
  } finally {
    await session.close();
  }
}

export function toNeo4jInt(value: number): Integer {
  return int(value);
}

export function __resetForTests(): void {
  driver = null;
  connecting = null;
}
