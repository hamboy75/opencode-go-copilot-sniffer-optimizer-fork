import * as vscode from "vscode";
import { DEFAULT_VISION_PROMPT } from "./types";

/**
 * Call a vision-capable model to answer a question about an image.
 * Unlike the old describe_image approach which always used a fixed prompt,
 * this passes the model's specific query to the vision model, allowing
 * targeted questions (e.g. "What color is the button?", "Read the error message").
 * @param query The specific question to ask about the image.
 * @returns The answer text from the vision model.
 */
export async function callVisionModel(
    imageData: Uint8Array,
    mimeType: string,
    visionModelId: string,
    query: string | undefined,
    token: vscode.CancellationToken
): Promise<string> {
    const models = await vscode.lm.selectChatModels({ id: visionModelId });
    if (!models || models.length === 0) {
        throw new Error(`Vision model "${visionModelId}" not found. Check the opencodego.visionProxyModel setting.`);
    }

    const visionModel = models[0];
    const dataPart = new vscode.LanguageModelDataPart(imageData, mimeType);
    const prompt = query ?? DEFAULT_VISION_PROMPT;
    const textPart = new vscode.LanguageModelTextPart(prompt);
    const msg = new vscode.LanguageModelChatMessage(
        vscode.LanguageModelChatMessageRole.User,
        [dataPart, textPart]
    );

    const options: vscode.LanguageModelChatRequestOptions & { reasoningEffort?: string } = {};
    // Enable thinking for better image analysis when the model supports it
    const visionThinking = vscode.workspace.getConfiguration().get<boolean>("opencodego.visionProxyThinking", true);
    if (visionThinking) {
        options.reasoningEffort = "high";
    }
    const response = await visionModel.sendRequest([msg], options, token);
    let description = "";
    for await (const chunk of response.stream) {
        if (chunk instanceof vscode.LanguageModelTextPart) {
            description += chunk.value;
        }
    }
    return description.trim();
}
