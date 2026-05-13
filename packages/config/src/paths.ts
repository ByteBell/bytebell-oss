import os from "node:os";
import path from "node:path";

let testHomeOverride: string | null = null;
const cacheInvalidators: Array<() => void> = [];

export function getBytebellHome(): string {
  if (testHomeOverride !== null) {
    return testHomeOverride;
  }
  return path.join(os.homedir(), ".bytebell");
}

export function getConfigPath(): string {
  return path.join(getBytebellHome(), "config.json");
}

export function __registerCacheInvalidator(fn: () => void): void {
  cacheInvalidators.push(fn);
}

export function __notifyConfigChanged(): void {
  for (const fn of cacheInvalidators) {
    fn();
  }
}

export function __setBytebellHomeForTests(home: string | null): void {
  testHomeOverride = home;
  __notifyConfigChanged();
}

/**
 * Dev-mode toggle. Enabled by `BYTEBELL_DEV=1` on the shell session.
 *
 * Narrow purpose: redirect log output to the working directory so contributors
 * can tail logs without cd-ing to ~/.bytebell. Does NOT bypass the Rule of Env
 * Vars — no infra URI, credential, or persisted setting is sourced here.
 */
export function isDevMode(): boolean {
  return process.env["BYTEBELL_DEV"] === "1";
}
