import { seedConfig } from "@bb/config";
import { seedLoggerFactory, type LoggerFactory } from "@bb/logger";
import { connectMongo } from "@bb/mongo";
import { connectNeo4j } from "@bb/neo4j";

export interface BootstrapRuntimeOptions {
  config: unknown;
  loggerFactory: LoggerFactory;
}

export async function bootstrapRuntime(opts: BootstrapRuntimeOptions): Promise<void> {
  seedConfig(opts.config);
  seedLoggerFactory(opts.loggerFactory);
  await connectMongo();
  await connectNeo4j();
}
