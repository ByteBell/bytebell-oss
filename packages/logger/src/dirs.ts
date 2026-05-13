import fs from "node:fs";
import path from "node:path";
import { getBytebellHome, isDevMode } from "@bb/config";

const LOGS_DIR_NAME = "logs";
const DIR_MODE = 0o700;

/**
 * Resolves the directory log files are written to. In dev mode
 * (`BYTEBELL_DEV=1`) this is `<cwd>/logs/`, so contributors can tail logs
 * from the project they're working in. Otherwise the canonical
 * `~/.bytebell/logs/` is used. The CLI's server-spawn redirect honors the
 * same toggle, so both Winston output and bun stdout/stderr land together.
 */
export function getLogsDir(): string {
  if (isDevMode()) {
    return path.join(process.cwd(), LOGS_DIR_NAME);
  }
  return path.join(getBytebellHome(), LOGS_DIR_NAME);
}

export function ensureLogsDir(): void {
  fs.mkdirSync(getLogsDir(), { recursive: true, mode: DIR_MODE });
}
