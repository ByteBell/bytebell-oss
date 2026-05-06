import { useState } from "react";
import type { ReactElement } from "react";
import { Box, Text, useApp, useInput } from "ink";

export interface DeleteSelectorItem {
  knowledgeId: string;
  label: string;
  detail: string;
}

export interface DeleteSelectorProps {
  items: DeleteSelectorItem[];
  onDone: (result: { picked?: DeleteSelectorItem; cancelled?: boolean }) => void;
}

type Phase = "select" | "confirm";

export function DeleteSelector({ items, onDone }: DeleteSelectorProps): ReactElement {
  const { exit } = useApp();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("select");

  useInput((input, key) => {
    if (key.escape) {
      exit();
      onDone({ cancelled: true });
      return;
    }
    if (phase === "select") {
      if (key.upArrow || input === "k") {
        setIndex((i) => (i > 0 ? i - 1 : items.length - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setIndex((i) => (i < items.length - 1 ? i + 1 : 0));
        return;
      }
      if (key.return) {
        setPhase("confirm");
      }
      return;
    }
    if (phase === "confirm") {
      if (input === "y" || input === "Y") {
        const picked = items[index];
        exit();
        if (picked === undefined) {
          onDone({ cancelled: true });
        } else {
          onDone({ picked });
        }
        return;
      }
      if (input === "n" || input === "N") {
        setPhase("select");
      }
    }
  });

  const selected = items[index];

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} paddingY={0}>
      <Box marginBottom={1}>
        <Text bold>Select an entry to delete</Text>
      </Box>
      {items.map((item, i) => (
        <Box key={item.knowledgeId}>
          {i === index ? <Text color="cyan">▶ {item.label}</Text> : <Text> {item.label}</Text>}
          <Text dimColor> {item.detail}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        {phase === "select" ? (
          <Text dimColor>[↑/↓ or j/k] move [Enter] choose [Esc] cancel</Text>
        ) : (
          <Text color="yellow">Delete {selected?.label ?? "?"} from Mongo + Neo4j? [y/N]</Text>
        )}
      </Box>
    </Box>
  );
}
