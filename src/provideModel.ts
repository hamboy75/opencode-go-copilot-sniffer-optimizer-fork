import * as vscode from "vscode";
import { CancellationToken, LanguageModelChatInformation, PrepareLanguageModelChatModelOptions } from "vscode";

import { logger } from "./logger";
import { getBuiltInModelInfos } from "./models";
import { getZenFreeModelInfos } from "./zen/zenModels";

const EXTENSION_LABEL = "OpenCodeGo";

/**
 * Get the list of available language models contributed by this provider.
 * When the "opencodegosniffer.enableZenFreeModels" setting is enabled, OpenCode Zen
 * free models are fetched and appended to the built-in model list.
 */
export async function prepareLanguageModelChatInformation(
    options: PrepareLanguageModelChatModelOptions,
    _token: CancellationToken,
    _secrets: vscode.SecretStorage
): Promise<LanguageModelChatInformation[]> {
    // Use built-in hardcoded model list
    const infos = getBuiltInModelInfos();

    // Conditionally append Zen free models
    const config = vscode.workspace.getConfiguration();
    const enableZen = config.get<boolean>("opencodegosniffer.enableZenFreeModels", false);
    if (enableZen) {
        try {
            const zenInfos = await getZenFreeModelInfos(_secrets);
            if (zenInfos.length > 0) {
                infos.push(...zenInfos);
                logger.info("models.loaded", { count: zenInfos.length, source: "zen" });
            }
        } catch (error) {
            // Silently degrade: if Zen model fetch fails, just use built-in models
            logger.error("models.loaded", {
                source: "zen",
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    logger.info("models.loaded", { count: infos.length, source: "total" });
    return infos;
}
