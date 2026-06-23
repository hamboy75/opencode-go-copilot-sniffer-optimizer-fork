import * as crypto from "node:crypto";
import type { StreamUsage } from "../commonApi";
import type { LocalStatsRequest, LocalStatsSummary, PruningSnapshot, RequestStatus, UsageSnapshot } from "./types";

export interface StartRequestInput {
    modelId: string;
    upstreamModelId?: string;
    apiMode: string;
    baseUrl: string;
    url?: string;
    messageCount: number;
    estimatedInputTokens?: number;
    requestBody?: unknown;
    capturePayloads: boolean;
}

export interface FinishRequestInput {
    status: RequestStatus;
    error?: string;
    estimatedOutputTokens?: number;
    usage?: UsageSnapshot;
    httpStatus?: number;
}

class LocalStatsRecorder {
    private requests = new Map<string, LocalStatsRequest>();
    private order: string[] = [];
    private maxEntries = 200;
    private enabled = true;
    private capturePayloads = false;

    configure(input: { enabled: boolean; capturePayloads: boolean; maxEntries: number }): void {
        this.enabled = input.enabled;
        this.capturePayloads = input.capturePayloads;
        this.maxEntries = Math.max(10, Math.min(input.maxEntries || 200, 5000));
        this.trim();
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    shouldCapturePayloads(): boolean {
        return this.capturePayloads;
    }

    start(input: StartRequestInput): string | undefined {
        if (!this.enabled) {
            return undefined;
        }
        const id = crypto.randomUUID();
        const record: LocalStatsRequest = {
            id,
            startedAt: new Date().toISOString(),
            status: "running",
            modelId: input.modelId,
            upstreamModelId: input.upstreamModelId,
            apiMode: input.apiMode,
            baseUrl: input.baseUrl,
            url: input.url,
            messageCount: input.messageCount,
            estimatedInputTokens: input.estimatedInputTokens,
            requestBody: input.capturePayloads ? input.requestBody : undefined,
            chunkCount: 0,
        };
        this.requests.set(id, record);
        this.order.unshift(id);
        this.trim();
        return id;
    }

    setRequestBody(id: string | undefined, requestBody: unknown, url?: string): void {
        if (!id) return;
        const record = this.requests.get(id);
        if (!record) return;
        if (this.capturePayloads) {
            record.requestBody = requestBody;
        }
        if (url) {
            record.url = url;
        }
    }

    setPruningStats(id: string | undefined, pruning: PruningSnapshot): void {
        if (!id) return;
        const record = this.requests.get(id);
        if (!record) return;
        record.pruning = pruning;
    }

    recordChunk(id: string | undefined, text: string): void {
        if (!id || !text) return;
        const record = this.requests.get(id);
        if (!record) return;
        record.chunkCount += 1;
        if (record.firstTokenLatencyMs === undefined) {
            record.firstTokenLatencyMs = Date.now() - Date.parse(record.startedAt);
        }
        if (this.capturePayloads) {
            record.responseText = (record.responseText ?? "") + text;
        }
        const previewBase = record.responseText ?? ((record.responsePreview ?? "") + text);
        record.responsePreview = previewBase.slice(0, 1000);
    }

    recordUsage(id: string | undefined, usage: StreamUsage, source: "api" | "estimated" = "api"): void {
        if (!id) return;
        const record = this.requests.get(id);
        if (!record) return;
        record.usage = {
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.promptTokens + usage.completionTokens,
            cacheHitTokens: usage.cacheHitTokens,
            source,
        };
    }

    finish(id: string | undefined, input: FinishRequestInput): void {
        if (!id) return;
        const record = this.requests.get(id);
        if (!record) return;
        record.status = input.status;
        record.endedAt = new Date().toISOString();
        record.durationMs = Date.parse(record.endedAt) - Date.parse(record.startedAt);
        record.error = input.error;
        record.estimatedOutputTokens = input.estimatedOutputTokens;
        record.httpStatus = input.httpStatus;
        if (input.usage) {
            record.usage = input.usage;
        }
    }

    list(limit = 50): LocalStatsRequest[] {
        const safeLimit = Math.max(1, Math.min(limit, this.maxEntries));
        return this.order.slice(0, safeLimit).map((id) => this.requests.get(id)).filter(Boolean) as LocalStatsRequest[];
    }

    get(id: string): LocalStatsRequest | undefined {
        return this.requests.get(id);
    }

    clear(): void {
        this.requests.clear();
        this.order = [];
    }

    summary(): LocalStatsSummary {
        const items = this.list(this.maxEntries);
        const finished = items.filter((r) => typeof r.durationMs === "number");
        const ok = items.filter((r) => r.status === "ok");
        const errors = items.filter((r) => r.status === "error");
        const aborted = items.filter((r) => r.status === "aborted");
        const running = items.filter((r) => r.status === "running");
        const totalDuration = finished.reduce((sum, r) => sum + (r.durationMs ?? 0), 0);
        const tokenTotals = items.reduce((acc, r) => {
            acc.prompt += r.usage?.promptTokens ?? r.estimatedInputTokens ?? 0;
            acc.completion += r.usage?.completionTokens ?? r.estimatedOutputTokens ?? 0;
            return acc;
        }, { prompt: 0, completion: 0 });
        const pruningTotals = items.reduce((acc, r) => {
            acc.saved += r.pruning?.savedEstimatedTokens ?? 0;
            acc.original += r.pruning?.originalEstimatedTokens ?? 0;
            if (typeof r.pruning?.savedPercent === "number") {
                acc.percentSum += r.pruning.savedPercent;
                acc.percentCount += 1;
            }
            return acc;
        }, { saved: 0, original: 0, percentSum: 0, percentCount: 0 });

        return {
            enabled: this.enabled,
            capturePayloads: this.capturePayloads,
            maxEntries: this.maxEntries,
            totalRequests: items.length,
            runningRequests: running.length,
            okRequests: ok.length,
            errorRequests: errors.length,
            abortedRequests: aborted.length,
            averageDurationMs: finished.length ? Math.round(totalDuration / finished.length) : null,
            totalPromptTokens: tokenTotals.prompt,
            totalCompletionTokens: tokenTotals.completion,
            totalPruningSavedTokens: pruningTotals.saved,
            totalPruningOriginalTokens: pruningTotals.original,
            averagePruningSavedPercent: pruningTotals.percentCount ? Math.round((pruningTotals.percentSum / pruningTotals.percentCount) * 10) / 10 : null,
        };
    }

    private trim(): void {
        while (this.order.length > this.maxEntries) {
            const id = this.order.pop();
            if (id) {
                this.requests.delete(id);
            }
        }
    }
}

export const localStatsRecorder = new LocalStatsRecorder();
