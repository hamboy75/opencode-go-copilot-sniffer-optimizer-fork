/**
 * Stored image data for ask_image tool processing.
 */
export interface StoredImage {
    /** Raw image bytes */
    data: Uint8Array;
    /** MIME type (e.g. "image/png") */
    mimeType: string;
}

/**
 * Information about an intercepted ask_image tool call.
 */
export interface InterceptedToolCall {
    /** Tool call ID from the API */
    id: string;
    /** Tool name (always "ask_image") */
    name: string;
    /** Parsed arguments (imageIndex, query) */
    args: { imageIndex: number; query: string };
}

/**
 * The ask_image tool definition to inject into API requests.
 * Unlike a simple "describe_image" approach, this tool lets the model
 * ask a specific question about the image, which a vision-capable model
 * will answer. The model can ask about colors, text, UI elements, objects,
 * or any other visual detail it needs to know.
 */
export const ASK_IMAGE_TOOL_DEF = {
    type: "function" as const,
    function: {
        name: "ask_image",
        description: "READ THIS: The user sent an image. I am a text-only model and CANNOT see images. I MUST call this tool to learn about the image.\n\nSTRATEGY:\n1. First call ask_image with query='Describe this image briefly' to get a quick overview of what the image shows.\n2. Then, based on what the user needs, call ask_image again with specific questions (e.g., 'What color is the button?', 'What error message appears at the top?', 'Read all visible text', 'What UI elements are on the left panel?').\n\nThe vision model answers each query independently based on what it sees. I should ALWAYS call this tool when the user mentions an attached image or asks about image contents. Without calling this tool, I cannot know what the image contains.",
        parameters: {
            type: "object",
            properties: {
                imageIndex: {
                    type: "integer",
                    description: "The 0-based index of the image to ask about",
                },
                query: {
                    type: "string",
                    description: "The question to ask about the image.\n\nTIPS:\n- Start broad: 'Describe this image briefly' or 'What is shown in this screenshot?' to get context.\n- Then drill down: 'What color is the highlighted button?', 'What error message appears?', 'Read all visible text', 'What icons are in the toolbar?', 'Describe the layout of the dialog box'.\n- The vision model only sees the image, not your previous conversation — each call is independent, so include enough context in your query.\n\nExamples of good queries: 'Describe this image briefly', 'What error message appears?', 'List all visible UI elements with their labels', 'What is the main heading text?', 'Describe the chart or diagram shown'.",
                },
            },
            required: ["imageIndex", "query"],
        },
    },
};

export const ASK_IMAGE_TOOL_NAME = "ask_image";

export const DEFAULT_VISION_PROMPT =
    "Analyze this image and answer the user's question based on visual content only. Be accurate and specific.";
