import { logger } from "@bb/logger";
import type { FileAnalyzer } from "#src/types/pipeline.ts";
import type { IngestStrategy, StrategyInput, StrategyResult } from "#src/types/strategy.ts";
import { throwIfCancelled } from "#src/pipeline/cancellation.ts";
import { classifyFailure } from "#src/pipeline/failure-classifier.ts";
import { classifyAndAnalyseSmall } from "./phases/classify-and-analyse-small.ts";
import { processBigFilesQueue } from "./phases/process-big-files.ts";
import { backfillMissingFields } from "./backfill/fields.ts";
import { backfillBigFiles } from "./backfill/big-files.ts";
import { runFolderSummaryPhase } from "./folder-summary.ts";
import { makeRepoSummaryEnvelope, persistRepoSummary, summariseRepo } from "./repo-summary.ts";
import { storeFlatAnalysis } from "./phases/store-flat-analysis.ts";
import type { ProgressContext, ProgressContextFactory } from "#src/progress/types.ts";
import { nullProgressContextFactory } from "#src/progress/NullProgressReporter.ts";

export interface FlatFolderStrategyDeps {
  fileAnalyzer: FileAnalyzer;
  progressContextFactory?: ProgressContextFactory;
}

export function createFlatFolderStrategy(deps: FlatFolderStrategyDeps): IngestStrategy {
  const progressContextFactory = deps.progressContextFactory ?? nullProgressContextFactory;
  return {
    name: "flat-folder",
    async execute(input: StrategyInput): Promise<StrategyResult> {
      const { context, source, archiveSink, metaPaths, payload, branch } = input;
      const { knowledgeId, orgId, repoId, llmCallContext } = context;
      const progressContext: ProgressContext = progressContextFactory(knowledgeId);

      try {
        progressContext.phaseChanged("file_analysis");

        logger.info(`flat-folder: phase1 (classify + analyse small) starting for ${knowledgeId}`);
        throwIfCancelled(knowledgeId);
        const phase1Input: Parameters<typeof classifyAndAnalyseSmall>[0] = {
          knowledgeId,
          source,
          metaPaths,
          analyzer: deps.fileAnalyzer,
          progressContext,
        };
        if (archiveSink !== undefined) {
          phase1Input.archiveSink = archiveSink;
        }
        if (llmCallContext !== undefined) {
          phase1Input.llmCallContext = llmCallContext;
        }
        const phase1 = await classifyAndAnalyseSmall(phase1Input);
        let totalInputTokens = phase1.tokenUsage.inputTokens;
        let totalOutputTokens = phase1.tokenUsage.outputTokens;
        let totalCostUsd = phase1.tokenUsage.costUsd;

        logger.info(`flat-folder: phase2 (process big files) starting`);
        throwIfCancelled(knowledgeId);
        const phase2Input: Parameters<typeof processBigFilesQueue>[0] = {
          knowledgeId,
          source,
          metaPaths,
          progressContext,
        };
        if (llmCallContext !== undefined) {
          phase2Input.llmCallContext = llmCallContext;
        }
        const phase2 = await processBigFilesQueue(phase2Input);
        totalInputTokens += phase2.tokenUsage.inputTokens;
        totalOutputTokens += phase2.tokenUsage.outputTokens;
        totalCostUsd += phase2.tokenUsage.costUsd;

        logger.info(`flat-folder: phase3 (backfill missing fields) starting`);
        throwIfCancelled(knowledgeId);
        await backfillMissingFields(metaPaths, llmCallContext, progressContext);

        logger.info(`flat-folder: phase4 (backfill big files) starting`);
        throwIfCancelled(knowledgeId);
        const phase4Input: Parameters<typeof backfillBigFiles>[0] = {
          knowledgeId,
          source,
          metaPaths,
          progressContext,
        };
        if (llmCallContext !== undefined) {
          phase4Input.llmCallContext = llmCallContext;
        }
        await backfillBigFiles(phase4Input);

        progressContext.phaseChanged("folder_analysis");
        logger.info(`flat-folder: phase5 (folder summaries) starting`);
        throwIfCancelled(knowledgeId);
        const phase5 = await runFolderSummaryPhase(knowledgeId, metaPaths, llmCallContext, progressContext);
        totalInputTokens += phase5.tokenUsage.inputTokens;
        totalOutputTokens += phase5.tokenUsage.outputTokens;
        totalCostUsd += phase5.tokenUsage.costUsd;

        progressContext.phaseChanged("indexing");
        logger.info(`flat-folder: phase6 (repo summary) starting`);
        throwIfCancelled(knowledgeId);
        const { summary: repoSummary, tokenUsage: repoUsage } = await summariseRepo(
          knowledgeId,
          metaPaths,
          llmCallContext,
        );
        totalInputTokens += repoUsage.inputTokens;
        totalOutputTokens += repoUsage.outputTokens;
        totalCostUsd += repoUsage.costUsd;
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
          progressContext,
        });

        progressContext.completed();

        return {
          filesAnalyzed: phase1.smallFilesAnalysed + phase2.processed + phase2.cached + phase1.oversizedStubs,
          foldersSummarised: phase5.succeeded,
          repoSummarised,
          graphNodesWritten: phase7.nodesWritten,
          tokenUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, costUsd: totalCostUsd },
        };
      } catch (cause: unknown) {
        const { category, reason, detail } = classifyFailure(cause);
        progressContext.failed(reason, undefined, category, detail);
        throw cause;
      }
    },
  };
}
