/**
 * Usage Tracking Types
 * Parity with mcp-server architecture
 */

export interface UsageDoc {
  identityId: string; // orgId or userId
  year: number; // e.g., 2024
  month: number; // 1-12
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  tokensUsed: number;
  lastUpdated: Date;
  createdAt: Date;
}

export interface ActivityDoc {
  identityId: string;
  toolName: string;
  query: string;
  responseSnippet: string;
  durationMs: number;
  tokens: {
    input: number;
    output: number;
  };
  createdAt: Date;
}

export interface UsageIncrement {
  identityId: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ActivityInput {
  identityId: string;
  toolName: string;
  query: string;
  response: string;
  durationMs: number;
  tokens: {
    input: number;
    output: number;
  };
}
