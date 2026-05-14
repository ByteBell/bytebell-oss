import winston from "winston";
import { getConfigValue } from "@bb/config";
import { Config } from "@bb/types";
import { ensureLogsDir } from "./dirs.ts";
import { flushTransport, makeConsoleTransport, makeFileTransport } from "./transports.ts";

export type LoggerScope = "server" | "cli";

export type LoggerFactory = (scope: LoggerScope) => winston.Logger;

const scopeLoggers = new Map<LoggerScope, winston.Logger>();
let seededFactory: LoggerFactory | null = null;

function buildLogger(scope: LoggerScope): winston.Logger {
  ensureLogsDir();
  const level = getConfigValue(Config.LogLevel);
  return winston.createLogger({
    level,
    transports: [makeFileTransport(scope), makeConsoleTransport()],
  });
}

export function seedLoggerFactory(factory: LoggerFactory): void {
  seededFactory = factory;
  scopeLoggers.clear();
}

export function __isLoggerFactorySeeded(): boolean {
  return seededFactory !== null;
}

export function getLogger(scope: LoggerScope): winston.Logger {
  const cached = scopeLoggers.get(scope);
  if (cached !== undefined) {
    return cached;
  }
  const logger = seededFactory !== null ? seededFactory(scope) : buildLogger(scope);
  scopeLoggers.set(scope, logger);
  return logger;
}

export async function shutdownLoggers(): Promise<void> {
  const transports: winston.transport[] = [];
  for (const logger of scopeLoggers.values()) {
    transports.push(...logger.transports);
    logger.close();
  }
  await Promise.all(transports.map(flushTransport));
  scopeLoggers.clear();
}

export function __resetLoggersForTests(): void {
  for (const logger of scopeLoggers.values()) {
    logger.close();
  }
  scopeLoggers.clear();
  seededFactory = null;
}
