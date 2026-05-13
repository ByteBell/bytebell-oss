import { logger } from "@bb/logger";
import type { FileAnalyzer } from "src/types/pipeline.ts";
import type { IngestStrategy, StrategyInput, StrategyResult } from "src/types/strategy.ts";
import { throwIfCancelled } from "src/pipeline/cancellation.ts";
import { classifyAndAnalyseSmall } from "./phases/classify-and-analyse-small.ts";
import { processBigFilesQueue } from "./phases/process-big-files.ts";
import { backfillMissingFields } from "./backfill/fields.ts";
import { backfillBigFiles } from "./backfill/big-files.ts";
import { runFolderSummaryPhase } from "./folder-summary.ts";
import { makeRepoSummaryEnvelope, persistRepoSummary, summariseRepo } from "./repo-summary.ts";
import { storeFlatAnalysis } from "./phases/store-flat-analysis.ts";

export interface FlatFolderStrategyDeps {
  fileAnalyzer: FileAnalyzer;
}

export function createFlatFolderStrategy(deps: FlatFolderStrategyDeps): IngestStrategy {
  return {
    name: "flat-folder",
    async execute(input: StrategyInput): Promise<StrategyResult> {
      const { context, source, archiveSink, metaPaths, payload, branch } = input;
      const { knowledgeId, orgId, repoId } = context;

      logger.info(`flat-folder: phase1 (classify + analyse small) starting for ${knowledgeId}`);
      throwIfCancelled(knowledgeId);
      const phase1Input: Parameters<typeof classifyAndAnalyseSmall>[0] = {
        knowledgeId,
        source,
        metaPaths,
        analyzer: deps.fileAnalyzer,
      };
      if (archiveSink !== undefined) {
        phase1Input.archiveSink = archiveSink;
      }
      const phase1 = await classifyAndAnalyseSmall(phase1Input);

      logger.info(`flat-folder: phase2 (process big files) starting`);
      throwIfCancelled(knowledgeId);
      const phase2 = await processBigFilesQueue({ knowledgeId, source, metaPaths });

      logger.info(`flat-folder: phase3 (backfill missing fields) starting`);
      throwIfCancelled(knowledgeId);
      await backfillMissingFields(metaPaths);

      logger.info(`flat-folder: phase4 (backfill big files) starting`);
      throwIfCancelled(knowledgeId);
      await backfillBigFiles({ knowledgeId, source, metaPaths });

      logger.info(`flat-folder: phase5 (folder summaries) starting`);
      throwIfCancelled(knowledgeId);
      const phase5 = await runFolderSummaryPhase(knowledgeId, metaPaths);

      logger.info(`flat-folder: phase6 (repo summary) starting`);
      throwIfCancelled(knowledgeId);
      const repoSummary = await summariseRepo(knowledgeId, metaPaths);
      let repoSummarised = false;
      if (repoSummary !== null) {
        await persistRepoSummary(metaPaths, makeRepoSummaryEnvelope(knowledgeId, orgId, repoSummary));
        repoSummarised = true;
      }

      logger.info(`flat-folder: phase7 (graph store) starting`);
      throwIfCancelled(knowledgeId);
      const phase7 = await storeFlatAnalysis({
        scope: { orgId, knowledgeId, repoId },
        payload,
        branch,
        metaPaths,
      });

      return {
        filesAnalyzed: phase1.smallFilesAnalysed + phase2.processed + phase2.cached + phase1.oversizedStubs,
        foldersSummarised: phase5.succeeded,
        repoSummarised,
        graphNodesWritten: phase7.nodesWritten,
      };
    },
  };
}
