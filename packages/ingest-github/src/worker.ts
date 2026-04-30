import { createHash } from "node:crypto";
import { JobType, KnowledgeState, type GithubIndexPayload, type JobMessage } from "@bb/types";
import { setKnowledgeState, upsertRawFile } from "@bb/mongo";
import { registerWorker } from "@bb/queue";
import { IngestError } from "@bb/errors";
import { ensureReposRoot, repoCloneDir } from "./paths.ts";
import { gitClone } from "./clone.ts";
import { walkRepo } from "./scan.ts";
import { analyzeFile } from "./analyze.ts";

const DEFAULT_BRANCH = "main";

export function registerGithubWorkers(): void {
  registerWorker(JobType.GithubIndex, handleGithubIndex);
}

async function handleGithubIndex(msg: JobMessage<GithubIndexPayload>): Promise<void> {
  const { knowledgeId, repoUrl, branch, gitToken } = msg.payload;
  await setKnowledgeState(knowledgeId, KnowledgeState.Processing);
  try {
    await ensureReposRoot();
    const destDir = repoCloneDir(knowledgeId);
    await gitClone({
      repoUrl,
      branch: branch ?? DEFAULT_BRANCH,
      destDir,
      ...(gitToken !== undefined ? { gitToken } : {}),
    });
    for await (const file of walkRepo(destDir)) {
      const { language, analysis } = await analyzeFile(file.relativePath, file.content);
      await upsertRawFile({
        knowledgeId,
        relativePath: file.relativePath,
        content: file.content,
        sha: sha256(file.content),
        sizeBytes: file.sizeBytes,
        language,
        analysis,
      });
    }
    await setKnowledgeState(knowledgeId, KnowledgeState.Processed);
  } catch (cause: unknown) {
    await setKnowledgeState(knowledgeId, KnowledgeState.Failed).catch(() => undefined);
    throw new IngestError(knowledgeId, "github_index handler failed", cause);
  }
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
