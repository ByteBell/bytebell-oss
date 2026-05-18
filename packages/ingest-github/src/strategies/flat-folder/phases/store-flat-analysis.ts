import { readFile } from "node:fs/promises";
import { logger } from "@bb/logger";
import { ensureFlatFolderIndexes, upsertFileNode, upsertFolderNode, upsertRepoNode, type NodeScope } from "@bb/neo4j";
import type { GithubIndexPayload } from "@bb/types";
import type { MetaPaths } from "#src/types/meta-paths.ts";
import { throwIfCancelled } from "#src/pipeline/cancellation.ts";
import { iterateCondensed } from "#src/strategies/flat-folder/big-file/storage.ts";
import { iterateFolderSummaries } from "#src/strategies/flat-folder/folder-summary.ts";
import { directFolderOf } from "#src/strategies/flat-folder/folder-path.ts";
import { languageFromPath } from "#src/adapters/llm-file-analyzer.ts";
import type { ProgressContext } from "#src/progress/types.ts";
import type { FolderSummary, RepoSummary, RepoSummaryEnvelope } from "#src/strategies/flat-folder/types.ts";

export interface StoreFlatAnalysisInput {
  scope: NodeScope;
  payload: GithubIndexPayload;
  branch: string;
  metaPaths: MetaPaths;
  progressContext?: ProgressContext;
}

export interface StoreFlatAnalysisResult {
  nodesWritten: number;
  foldersWritten: number;
  filesWritten: number;
}

export async function storeFlatAnalysis(input: StoreFlatAnalysisInput): Promise<StoreFlatAnalysisResult> {
  throwIfCancelled(input.scope.knowledgeId);
  await ensureFlatFolderIndexes();

  let nodesWritten = 0;
  let foldersWritten = 0;
  let filesWritten = 0;

  const repoSummary = await readRepoSummary(input.metaPaths);
  if (repoSummary !== null) {
    await upsertRepoNode({
      scope: input.scope,
      repoUrl: input.payload.repoUrl,
      branch: input.branch,
      summary: {
        purpose: repoSummary.purpose,
        summary: repoSummary.summary,
        keywords: repoSummary.keywords,
        architecture: repoSummary.architecture,
        dataFlow: repoSummary.dataFlow,
        majorSubsystems: repoSummary.majorSubsystems,
        keyPatterns: repoSummary.keyPatterns,
      },
    });
    nodesWritten += 1;
  } else {
    logger.warn(`phase7: no repo summary on disk; writing :Repo with empty summary`);
    await upsertRepoNode({
      scope: input.scope,
      repoUrl: input.payload.repoUrl,
      branch: input.branch,
      summary: emptyRepoSummaryPayload(),
    });
    nodesWritten += 1;
  }

  const folderReporter = input.progressContext?.reporter({
    phase: "indexing",
    subPhase: "folders",
    total: { kind: "growing" },
  });
  await folderReporter?.start();
  const folderPaths = new Set<string>();
  try {
    for await (const folder of iterateFolderSummaries(input.metaPaths)) {
      throwIfCancelled(input.scope.knowledgeId);
      folderReporter?.incrementSeen();
      await upsertFolderNode({
        scope: input.scope,
        folderPath: folder.folderPath,
        summary: shapeFolderPayload(folder),
      });
      folderPaths.add(folder.folderPath);
      foldersWritten += 1;
      nodesWritten += 1;
      folderReporter?.increment(1, { fileName: folder.folderPath || "<root>" });
    }
  } finally {
    folderReporter?.stop();
  }

  const fileReporter = input.progressContext?.reporter({
    phase: "indexing",
    subPhase: "files",
    total: { kind: "growing" },
  });
  await fileReporter?.start();
  try {
    for await (const file of iterateCondensed(input.metaPaths)) {
      throwIfCancelled(input.scope.knowledgeId);
      fileReporter?.incrementSeen();
      const folderPath = directFolderOf(file.relativePath);
      if (!folderPaths.has(folderPath)) {
        await upsertFolderNode({
          scope: input.scope,
          folderPath,
          summary: emptyFolderPayload(),
        });
        folderPaths.add(folderPath);
        foldersWritten += 1;
        nodesWritten += 1;
      }
      await upsertFileNode({
        orgId: input.scope.orgId,
        knowledgeId: input.scope.knowledgeId,
        repoId: input.scope.repoId,
        relativePath: file.relativePath,
        folderPath,
        language: file.language.length > 0 ? file.language : languageFromPath(file.relativePath),
        sha: file.sha256,
        sizeBytes: file.sizeBytes,
        analysis: file.analysis,
        isBigFile: file.isBigFile,
        totalChunks: file.totalChunks,
        totalTokenCount: file.totalTokenCount,
      });
      filesWritten += 1;
      nodesWritten += 1;
      fileReporter?.increment(1, { fileName: file.relativePath });
    }
  } finally {
    fileReporter?.stop();
  }

  logger.info(`phase7 done: nodesWritten=${nodesWritten} folders=${foldersWritten} files=${filesWritten}`);
  return { nodesWritten, foldersWritten, filesWritten };
}

function shapeFolderPayload(folder: FolderSummary): {
  purpose: string;
  summary: string;
  keywords: string[];
  classes: string[];
  functions: string[];
  importsInternal: string[];
  importsExternal: string[];
  dependencyGraph: string;
} {
  return {
    purpose: folder.purpose,
    summary: folder.summary,
    keywords: folder.keywords,
    classes: folder.classes,
    functions: folder.functions,
    importsInternal: folder.importsInternal,
    importsExternal: folder.importsExternal,
    dependencyGraph: folder.dependencyGraph,
  };
}

function emptyFolderPayload(): ReturnType<typeof shapeFolderPayload> {
  return {
    purpose: "",
    summary: "",
    keywords: [],
    classes: [],
    functions: [],
    importsInternal: [],
    importsExternal: [],
    dependencyGraph: "",
  };
}

function emptyRepoSummaryPayload(): {
  purpose: string;
  summary: string;
  keywords: string[];
  architecture: string;
  dataFlow: string;
  majorSubsystems: string[];
  keyPatterns: string[];
} {
  return {
    purpose: "",
    summary: "",
    keywords: [],
    architecture: "",
    dataFlow: "",
    majorSubsystems: [],
    keyPatterns: [],
  };
}

async function readRepoSummary(metaPaths: MetaPaths): Promise<RepoSummary | null> {
  try {
    const raw = await readFile(metaPaths.repoSummaryJson, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const envelope = parsed as RepoSummaryEnvelope;
    return envelope.repoSummary ?? null;
  } catch {
    return null;
  }
}
