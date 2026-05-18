import { useState } from "react";
import type { ReactElement } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Field } from "./Field.tsx";

export interface ManualBranchPromptResult {
  branch?: string;
  cancelled?: boolean;
}

export interface ManualBranchPromptProps {
  onDone: (result: ManualBranchPromptResult) => void;
}

export function ManualBranchPrompt({ onDone }: ManualBranchPromptProps): ReactElement {
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
      onDone({ branch: value });
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} paddingY={0}>
      <Box marginBottom={1}>
        <Text bold>Type branch name manually</Text>
      </Box>
      <Field id="branch" label="Branch Name" value={value} onChange={setValue} autoFocus />
      <Box marginTop={1}>
        <Text dimColor>[Enter] submit [Esc] cancel</Text>
      </Box>
    </Box>
  );
}
