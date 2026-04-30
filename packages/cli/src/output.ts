const GREEN = "[32m";
const RED = "[31m";
const RESET = "[0m";

function paint(color: string, line: string, stream: { isTTY?: boolean }): string {
  return stream.isTTY === true ? `${color}${line}${RESET}` : line;
}

export function success(line: string): void {
  process.stdout.write(`${paint(GREEN, `✓ ${line}`, process.stdout)}\n`);
}

export function error(line: string, hint?: string): void {
  process.stderr.write(`${paint(RED, `✗ ${line}`, process.stderr)}\n`);
  if (hint !== undefined && hint.length > 0) {
    process.stderr.write(`  Run: ${hint}\n`);
  }
}

export function list(label: string, items: readonly string[]): void {
  process.stderr.write(`${label}\n`);
  for (const item of items) {
    process.stderr.write(`    ${item}\n`);
  }
}
