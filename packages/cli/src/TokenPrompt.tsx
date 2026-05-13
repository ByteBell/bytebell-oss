import { useState } from "react";
import type { ReactElement } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Field } from "./Field.tsx";

/**
 * Single-field masked prompt for a GitHub PAT, shown when the commits
 * endpoint returns 404 for a private repo. Enter submits, Esc cancels.
 *
 * Intentionally narrower than SetupForm — one field, no validation beyond
 * non-empty, no config persistence. The collected token stays in-memory
 * for the current CLI invocation only.
 */

export interface TokenPromptResult {
  token?: string;
  cancelled?: boolean;
}

export interface TokenPromptProps {
  repoLabel: string;
  message?: string;
  onDone: (result: TokenPromptResult) => void;
}

export function TokenPrompt({ repoLabel, message, onDone }: TokenPromptProps): ReactElement {
  const { exit } = useApp();
  const [value, setValue] = useState("");

  useInput((_input, key) => {
    if (key.escape) {
      exit();
      onDone({ cancelled: true });
      return;
    }
    if (key.return && value.length > 0) {
      exit();
      onDone({ token: value });
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} paddingY={0}>
      <Box marginBottom={1}>
        <Text bold>GitHub token required for {repoLabel}</Text>
      </Box>
      {message !== undefined && message.length > 0 && (
        <Box marginBottom={1}>
          <Text dimColor>{message}</Text>
        </Box>
      )}
      <Field id="token" label="GitHub PAT" value={value} onChange={setValue} mask autoFocus />
      <Box marginTop={1}>
        <Text dimColor>[Enter] submit [Esc] cancel</Text>
      </Box>
    </Box>
  );
}
