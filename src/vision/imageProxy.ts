import * as vscode from "vscode";
import { DEFAULT_VISION_PROMPT } from "./types";
import type { StoredImage } from "./types";

/**
 * Build a standard set of request options for vision model calls.
 */
function buildVisionOptions(): vscode.LanguageModelChatRequestOptions {
    const options: vscode.LanguageModelChatRequestOptions = {};
    const visionThinking = vscode.workspace.getConfiguration().get<boolean>("opencodego.visionProxyThinking", false);
    if (visionThinking) {
        options.modelOptions = { reasoning_effort: "high" };
    } else {
        options.modelOptions = {
            reasoning_effort: "disabled",
            thinking: { type: false },
        };
    }
    return options;
}

/**
 * Send a message to a vision model, stream output via progress, and return the full text.
 */
async function sendToVisionModel(
    msg: vscode.LanguageModelChatMessage,
    visionModelId: string,
    token: vscode.CancellationToken,
    progress?: { report: (part: vscode.LanguageModelResponsePart) => void }
): Promise<string> {
    const models = await vscode.lm.selectChatModels({ id: visionModelId });
    if (!models || models.length === 0) {
        throw new Error(`Vision model "${visionModelId}" not found. Check the opencodego.visionProxyModel setting.`);
    }
    const visionModel = models[0];
    const response = await visionModel.sendRequest([msg], buildVisionOptions(), token);
    let result = "";
    for await (const chunk of response.stream) {
        if (chunk instanceof vscode.LanguageModelTextPart) {
            result += chunk.value;
            progress?.report(chunk);
        }
    }
    return result.trim();
}

/**
 * Call a vision-capable model to answer a question about a single image.
 * Streams the output via progress if provided.
 * @param query The specific question to ask about the image.
 * @returns The answer text from the vision model.
 */
export async function callVisionModel(
    imageData: Uint8Array,
    mimeType: string,
    visionModelId: string,
    query: string | undefined,
    token: vscode.CancellationToken,
    progress?: { report: (part: vscode.LanguageModelResponsePart) => void }
): Promise<string> {
    const dataPart = new vscode.LanguageModelDataPart(imageData, mimeType);
    const prompt = query ?? DEFAULT_VISION_PROMPT;
    const textPart = new vscode.LanguageModelTextPart(prompt);
    const msg = new vscode.LanguageModelChatMessage(
        vscode.LanguageModelChatMessageRole.User,
        [dataPart, textPart]
    );
    return sendToVisionModel(msg, visionModelId, token, progress);
}

/**
 * Call a vision-capable model to answer a question about MULTIPLE images.
 * Sends all images + query in a single message so the model can compare them.
 * Streams the output via progress if provided.
 * @param images Array of { data, mimeType } for each image.
 * @param query The comparison/analysis question.
 * @returns The answer text from the vision model.
 */
export async function callVisionModelMulti(
    images: StoredImage[],
    visionModelId: string,
    query: string | undefined,
    token: vscode.CancellationToken,
    progress?: { report: (part: vscode.LanguageModelResponsePart) => void }
): Promise<string> {
    const prompt = query ?? "Compare and analyze these images. What do you see?";
    const parts: (vscode.LanguageModelDataPart | vscode.LanguageModelTextPart)[] = [];
    for (const img of images) {
        parts.push(new vscode.LanguageModelDataPart(img.data, img.mimeType));
    }
    parts.push(new vscode.LanguageModelTextPart(prompt));
    const msg = new vscode.LanguageModelChatMessage(
        vscode.LanguageModelChatMessageRole.User,
        parts
    );
    return sendToVisionModel(msg, visionModelId, token, progress);
}
