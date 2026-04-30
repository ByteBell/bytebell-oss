import { LOG_LEVELS, setConfigValue, type LogLevel } from "@bb/config";
import { Config } from "@bb/types";

type Setter = (raw: string) => void;

export interface KeyEntry {
  configKey: Config;
  redact: boolean;
  setter: Setter;
}

function parsePositiveInt(raw: string, key: string): number {
  if (!/^-?\d+$/u.test(raw)) {
    throw new Error(`Invalid value for "${key}": expected an integer, got "${raw}"`);
  }
  const n = Number.parseInt(raw, 10);
  if (n <= 0) {
    throw new Error(`Invalid value for "${key}": expected a positive integer, got ${n}`);
  }
  return n;
}

function parsePort(raw: string): number {
  const n = parsePositiveInt(raw, "port");
  if (n > 65535) {
    throw new Error(`Invalid value for "port": ${n} is above 65535`);
  }
  return n;
}

function parseLogLevel(raw: string): LogLevel {
  const allowed: readonly string[] = LOG_LEVELS;
  if (!allowed.includes(raw)) {
    throw new Error(`Invalid value for "log-level": expected one of ${LOG_LEVELS.join(", ")}, got "${raw}"`);
  }
  return raw as LogLevel;
}

export const KEY_MAP: Record<string, KeyEntry> = {
  mongo: {
    configKey: Config.MongoUri,
    redact: false,
    setter: (s) => setConfigValue(Config.MongoUri, s),
  },
  neo4j: {
    configKey: Config.Neo4jUri,
    redact: false,
    setter: (s) => setConfigValue(Config.Neo4jUri, s),
  },
  "neo4j-user": {
    configKey: Config.Neo4jUser,
    redact: false,
    setter: (s) => setConfigValue(Config.Neo4jUser, s),
  },
  "neo4j-password": {
    configKey: Config.Neo4jPassword,
    redact: true,
    setter: (s) => setConfigValue(Config.Neo4jPassword, s),
  },
  redis: {
    configKey: Config.RedisUrl,
    redact: false,
    setter: (s) => setConfigValue(Config.RedisUrl, s),
  },
  port: {
    configKey: Config.ServerPort,
    redact: false,
    setter: (s) => setConfigValue(Config.ServerPort, parsePort(s)),
  },
  "log-level": {
    configKey: Config.LogLevel,
    redact: false,
    setter: (s) => setConfigValue(Config.LogLevel, parseLogLevel(s)),
  },
  "log-retention-days": {
    configKey: Config.LogRetentionDays,
    redact: false,
    setter: (s) => setConfigValue(Config.LogRetentionDays, parsePositiveInt(s, "log-retention-days")),
  },
  "concurrency.pdf": {
    configKey: Config.ConcurrencyPdf,
    redact: false,
    setter: (s) => setConfigValue(Config.ConcurrencyPdf, parsePositiveInt(s, "concurrency.pdf")),
  },
  "concurrency.website": {
    configKey: Config.ConcurrencyWebsite,
    redact: false,
    setter: (s) => setConfigValue(Config.ConcurrencyWebsite, parsePositiveInt(s, "concurrency.website")),
  },
  "concurrency.github": {
    configKey: Config.ConcurrencyGithub,
    redact: false,
    setter: (s) => setConfigValue(Config.ConcurrencyGithub, parsePositiveInt(s, "concurrency.github")),
  },
  "concurrency.bitbucket": {
    configKey: Config.ConcurrencyBitbucket,
    redact: false,
    setter: (s) => setConfigValue(Config.ConcurrencyBitbucket, parsePositiveInt(s, "concurrency.bitbucket")),
  },
};

export function validKeysList(): string[] {
  return Object.keys(KEY_MAP);
}
