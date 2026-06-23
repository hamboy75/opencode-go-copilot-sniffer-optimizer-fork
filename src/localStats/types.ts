export type RequestStatus = "running" | "ok" | "error" | "aborted";

export interface UsageSnapshot {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    cacheHitTokens?: number;
    source: "api" | "estimated";
}

export interface PruningSnapshot {
    mode: "off" | "preview" | "enabled";
    enabled: boolean;
    originalEstimatedTokens?: number;
    prunedEstimatedTokens?: number;
    sentEstimatedTokens?: number;
    savedEstimatedTokens?: number;
    savedPercent?: number;
    originalBytes?: number;
    prunedBytes?: number;
    savedBytes?: number;
    removedPaths: string[];
    modifiedStrings: string[];
    removePaths: string[];
    regexRules: string[];
}

export interface LocalStatsRequest {
    id: string;
    startedAt: string;
    endedAt?: string;
    durationMs?: number;
    status: RequestStatus;
    modelId: string;
    upstreamModelId?: string;
    apiMode: string;
    baseUrl: string;
    url?: string;
    messageCount: number;
    estimatedInputTokens?: number;
    estimatedOutputTokens?: number;
    usage?: UsageSnapshot;
    httpStatus?: number;
    pruning?: PruningSnapshot;
    error?: string;
    requestBody?: unknown;
    responseText?: string;
    responsePreview?: string;
    chunkCount: number;
    firstTokenLatencyMs?: number;
}

export interface LocalStatsSummary {
    enabled: boolean;
    capturePayloads: boolean;
    maxEntries: number;
    totalRequests: number;
    runningRequests: number;
    okRequests: number;
    errorRequests: number;
    abortedRequests: number;
    averageDurationMs: number | null;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalPruningSavedTokens: number;
    totalPruningOriginalTokens: number;
    averagePruningSavedPercent: number | null;
}
