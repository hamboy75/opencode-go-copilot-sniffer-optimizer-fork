import * as vscode from "vscode";
import type { LanguageModelChatInformation } from "vscode";
import type { OpenCodeGoModelItem } from "../types";
import { l10n } from "../localize";

// ── Hardcoded Zen free model IDs (from OpenCode Zen official documentation) ──
export const ZEN_FREE_MODEL_IDS: readonly string[] = [
    "big-pickle",
    "deepseek-v4-flash-free",
    "minimax-m2.5-free",
    "ring-2.6-1t-free",
    "nemotron-3-super-free",
];

/**
 * Metadata for each Zen free model.
 * Context lengths are conservative estimates; actual limits depend on Zen provider.
 * thinkingMode: "always" = thinking always on (no switch), "switchable" = user can toggle.
 * supportedReasoningEfforts: optional multi-level efforts (e.g. ["high", "max"]) for switchable models.
 * defaultReasoningEffort: default effort when thinking is enabled.
 */
const ZEN_FREE_MODEL_METADATA: Record<
    string,
    { displayName: string; contextLength: number; vision: boolean; maxTokens: number; thinkingMode: "switchable" | "always"; supportedReasoningEfforts?: string[]; defaultReasoningEffort?: string }
> = {
    "big-pickle": {
        displayName: "Zen/Big Pickle Free",
        contextLength: 128000,
        vision: false,
        maxTokens: 4096,
        thinkingMode: "always",
    },
    "deepseek-v4-flash-free": {
        displayName: "Zen/DeepSeek V4 Flash Free",
        contextLength: 1000000,
        vision: false,
        maxTokens: 32768,
        thinkingMode: "switchable",
        supportedReasoningEfforts: ["high", "max"],
        defaultReasoningEffort: "max",
    },
    "minimax-m2.5-free": {
        displayName: "Zen/MiniMax M2.5 Free",
        contextLength: 204800,
        vision: false,
        maxTokens: 32768,
        thinkingMode: "switchable",
    },
    "ring-2.6-1t-free": {
        displayName: "Zen/Ring 2.6 1T Free",
        contextLength: 128000,
        vision: false,
        maxTokens: 4096,
        thinkingMode: "switchable",
    },
    "nemotron-3-super-free": {
        displayName: "Zen/Nemotron 3 Super Free",
        contextLength: 128000,
        vision: false,
        maxTokens: 4096,
        thinkingMode: "switchable",
    },
};

const EXTENSION_LABEL_ZEN = "OpenCode Zen";
const ZEN_BASE_URL = "https://opencode.ai/zen/v1/";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── Module-level cache for Zen model list ──
let cachedModelIds: string[] | null = null;
let cacheTimestamp = 0;

/**
 * Fetch the full model list from OpenCode Zen API.
 * The endpoint follows OpenAI /v1/models format:
 *   { object: "list", data: [{ id: string, object: string, created: number, owned_by: string }, ...] }
 */
async function fetchZenModelList(apiKey: string): Promise<string[]> {
    const url = `${ZEN_BASE_URL.replace(/\/+$/, "")}/models`;
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Zen API error: [${response.status}] ${response.statusText}`);
    }

    const body = (await response.json()) as { data?: Array<{ id: string }> };
    return (body.data ?? []).map((m) => m.id);
}

/**
 * Build LanguageModelChatInformation array from a list of model IDs.
 * Only models present in ZEN_FREE_MODEL_METADATA are included.
 * - switchable models: include "disabled" option so user can turn off thinking
 * - always models: no "disabled" option, thinking always on
 */
function buildModelInfos(modelIds: string[]): LanguageModelChatInformation[] {
    const infos: LanguageModelChatInformation[] = [];

    for (const modelId of modelIds) {
        const meta = ZEN_FREE_MODEL_METADATA[modelId];
        if (!meta) {
            continue;
        }

        // Build reasoning effort enum based on thinking mode
        const hasEfforts = meta.supportedReasoningEfforts && meta.supportedReasoningEfforts.length > 0;
        let enumValues: string[];
        if (hasEfforts) {
            if (meta.thinkingMode === "switchable") {
                enumValues = ["disabled", ...meta.supportedReasoningEfforts!];
            } else {
                enumValues = [...meta.supportedReasoningEfforts!];
            }
        } else {
            if (meta.thinkingMode === "switchable") {
                enumValues = ["disabled", "enabled"];
            } else {
                enumValues = ["enabled"];
            }
        }
        const enumItemLabels = enumValues.map((e) => {
            switch (e) {
                case 'disabled': return l10n("Disabled");
                case 'enabled': return l10n("Thinking");
                case 'high': return l10n("High");
                case 'max': return l10n("Maximum");
                default: return e;
            }
        });
        const enumDescriptions = enumValues.map((e) => {
            switch (e) {
                case 'disabled': return l10n("Do not enable thinking");
                case 'enabled': return l10n("Enable thinking");
                case 'high': return l10n("Deeper thinking, slower response");
                case 'max': return l10n("Maximum thinking depth, slowest response");
                default: return e;
            }
        });
        const defaultEffort = meta.defaultReasoningEffort ?? "enabled";

        infos.push({
            id: modelId,
            name: meta.displayName,
            detail: "OpenCode Zen",
            tooltip: "OpenCode Zen",
            family: EXTENSION_LABEL_ZEN,
            version: "1.0.0",
            maxInputTokens: meta.contextLength,
            maxOutputTokens: meta.maxTokens,
            isUserSelectable: true,
            capabilities: {
                toolCalling: true,
                // Always declare imageInput=true so VS Code passes image data through.
                // Non-vision models handle images via the describe_image tool proxy internally.
                imageInput: true,
            },
            configurationSchema: {
                properties: {
                    reasoningEffort: {
                        type: "string",
                        title: l10n("Reasoning Effort"),
                        enum: enumValues,
                        enumItemLabels: enumItemLabels,
                        enumDescriptions: enumDescriptions,
                        default: defaultEffort,
                        group: "navigation",
                    },
                },
            },
        } satisfies LanguageModelChatInformation);
    }

    return infos;
}

/**
 * Get the list of available Zen free models as LanguageModelChatInformation[].
 *
 * Flow:
 * 1. Try to fetch the model list from Zen API (with 5 min cache)
 * 2. Intersect with hardcoded free model IDs
 * 3. If API is unreachable or no API key, return the full hardcoded list (optimistic)
 *
 * @param secrets SecretStorage instance for reading the API key.
 */
export async function getZenFreeModelInfos(secrets: vscode.SecretStorage): Promise<LanguageModelChatInformation[]> {
    const now = Date.now();

    // Use cached result if still fresh
    if (cachedModelIds !== null && now - cacheTimestamp < CACHE_TTL_MS) {
        return buildModelInfos(cachedModelIds);
    }

    // Try fetching from Zen API
    const apiKey = await secrets.get("opencodegosniffer.apiKey");

    if (apiKey) {
        try {
            const allModelIds = await fetchZenModelList(apiKey);
            // Intersect with hardcoded free model IDs
            const availableFreeModels = allModelIds.filter((id) => ZEN_FREE_MODEL_IDS.includes(id));

            // Update cache
            cachedModelIds = availableFreeModels;
            cacheTimestamp = now;

            return buildModelInfos(availableFreeModels);
        } catch (error) {
            console.error("[OpenCodeGo] Failed to fetch Zen model list:", error);
            // Fall through to use stale cache or full hardcoded list
        }
    }

    // Use stale cache if available
    if (cachedModelIds !== null) {
        return buildModelInfos(cachedModelIds);
    }

    // Optimistic: return all hardcoded free models
    cachedModelIds = [...ZEN_FREE_MODEL_IDS];
    cacheTimestamp = now;
    return buildModelInfos(cachedModelIds);
}

/**
 * Get model configuration for a Zen free model.
 * Returns undefined if the model ID is not a known Zen free model.
 */
export function getZenFreeModelConfig(modelId: string): OpenCodeGoModelItem | undefined {
    if (!ZEN_FREE_MODEL_IDS.includes(modelId)) {
        return undefined;
    }

    const meta = ZEN_FREE_MODEL_METADATA[modelId];
    if (!meta) {
        return undefined;
    }

    return {
        id: modelId,
        owned_by: "opencode",
        displayName: meta.displayName,
        baseUrl: ZEN_BASE_URL,
        vision: meta.vision,
        context_length: meta.contextLength,
        max_completion_tokens: meta.maxTokens,
        apiMode: "openai",
        enable_thinking: true,
        include_reasoning_in_request: true,
        thinkingMode: meta.thinkingMode,
    };
}
