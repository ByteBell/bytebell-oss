/**
 * Tiny interactive repo picker.
 *
 * Reads stdin in raw mode, renders the list with a cursor on the active row,
 * and handles up/down arrows, `j`/`k` (vi-style), Enter to select, `q`/Esc/Ctrl-C
 * to cancel. Returns the chosen entry's id or `null` on cancel.
 *
 * No external deps — stays consistent with the rest of the CLI which leans on
 * `commander` + raw ANSI sequences.
 */

const ESC = "";
const CSI = `${ESC}[`;
const CTRL_C = "";

const HIDE_CURSOR = `${CSI}?25l`;
const SHOW_CURSOR = `${CSI}?25h`;
const CLEAR_LINE = `${CSI}2K`;
const CURSOR_UP = (n: number): string => `${CSI}${n}A`;
const CURSOR_TO_COL_0 = `\r`;

const HIGHLIGHT = `${CSI}7m`;
const DIM = `${CSI}2m`;
const RESET = `${CSI}0m`;

export interface PickerEntry {
  /** The value returned from `pickRepo` when this row is selected. */
  knowledgeId: string;
  /** Primary line shown to the user (e.g. `github:owner/repo@main`). */
  label: string;
  /** Optional secondary fields printed dim after the label. */
  secondary?: string;
}

export interface PickerOptions {
  title?: string;
  /** Hint shown under the list. Defaults to a one-line key reference. */
  hint?: string;
}

const DEFAULT_HINT = "↑/↓ to move · enter to select · q / esc to cancel";

/**
 * Renders an interactive list. Resolves with the selected entry's `knowledgeId`,
 * or `null` if the user cancels. Returns `null` immediately when stdin isn't a
 * TTY — the caller should fall back to requiring an explicit argument.
 */
export async function pickRepo(entries: PickerEntry[], opts: PickerOptions = {}): Promise<string | null> {
  if (entries.length === 0) {
    return null;
  }
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    return null;
  }

  const title = opts.title ?? "Select a repo:";
  const hint = opts.hint ?? DEFAULT_HINT;

  let cursor = 0;
  let drawnLines = 0;
  process.stdout.write(HIDE_CURSOR);

  const draw = (): void => {
    if (drawnLines > 0) {
      // Move cursor back to the title line and clear what we drew last time.
      process.stdout.write(`${CURSOR_TO_COL_0}${CURSOR_UP(drawnLines - 1)}`);
      for (let i = 0; i < drawnLines; i++) {
        process.stdout.write(`${CLEAR_LINE}${i === drawnLines - 1 ? "" : "\n"}`);
      }
      process.stdout.write(`${CURSOR_TO_COL_0}${CURSOR_UP(drawnLines - 1)}`);
    }
    process.stdout.write(`${title}\n`);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e === undefined) {
        continue;
      }
      const marker = i === cursor ? "› " : "  ";
      const line = e.secondary !== undefined ? `${e.label} ${DIM}${e.secondary}${RESET}` : e.label;
      const row = i === cursor ? `${HIGHLIGHT}${marker}${line}${RESET}` : `${marker}${line}`;
      process.stdout.write(`${row}\n`);
    }
    process.stdout.write(`${DIM}${hint}${RESET}\n`);
    drawnLines = entries.length + 2;
  };

  draw();

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  return new Promise<string | null>((resolve) => {
    const cleanup = (result: string | null): void => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      // Clear the rendered list, leaving the terminal where the title used to be.
      if (drawnLines > 0) {
        process.stdout.write(`${CURSOR_TO_COL_0}${CURSOR_UP(drawnLines - 1)}`);
        for (let i = 0; i < drawnLines; i++) {
          process.stdout.write(`${CLEAR_LINE}${i === drawnLines - 1 ? "" : "\n"}`);
        }
        process.stdout.write(`${CURSOR_TO_COL_0}${CURSOR_UP(drawnLines - 1)}`);
      }
      process.stdout.write(SHOW_CURSOR);
      resolve(result);
    };

    const onData = (chunk: string): void => {
      // Cancel keys.
      if (chunk === CTRL_C || chunk === "q" || chunk === ESC) {
        cleanup(null);
        return;
      }
      // Enter / return.
      if (chunk === "\r" || chunk === "\n") {
        cleanup(entries[cursor]?.knowledgeId ?? null);
        return;
      }
      // Arrow keys arrive as `ESC[A` / `ESC[B`. Vi-style `k` / `j` also supported.
      if (chunk === `${CSI}A` || chunk === "k") {
        cursor = (cursor - 1 + entries.length) % entries.length;
        draw();
        return;
      }
      if (chunk === `${CSI}B` || chunk === "j") {
        cursor = (cursor + 1) % entries.length;
        draw();
        return;
      }
      // Numeric quick-jump (1..9) for short lists.
      if (/^[1-9]$/u.test(chunk)) {
        const n = Number.parseInt(chunk, 10) - 1;
        if (n < entries.length) {
          cursor = n;
          draw();
        }
      }
    };

    process.stdin.on("data", onData);
  });
}
