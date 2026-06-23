import * as vscode from "vscode";

const zhCN: Record<string, string> = {
	// statusBar
	"Token Count": "Token 计数",
	"Current model token usage": "当前模型 token 使用量",
	"Token Usage": "Token 使用量",
	"Ready": "就绪",

	// extension.ts - API key prompts
	"OpenCode GO Sniffer API Key": "OpenCode GO Sniffer API 密钥",
	"Update your OpenCode GO API key": "更新您的 OpenCode GO API 密钥",
	"Enter your OpenCode GO API key": "输入您的 OpenCode GO API 密钥",
	"OpenCode GO API key cleared.": "OpenCode GO API 密钥已清除。",
	"OpenCode GO API key saved.": "OpenCode GO API 密钥已保存。",

	// provider.ts
	"OpenCode GO API key not found": "未找到 OpenCode GO API 密钥",
	"Invalid base URL configuration.": "无效的 Base URL 配置。",

	// statusBar cache tooltip
	"Cache": "缓存",
	"({0} cached, {1}%)": "(已缓存 {0}, 命中率 {1}%)",
	"No changes found in any workspace repositories.": "在任何工作区仓库中均未发现更改。",
	"Git extension not found": "未找到 Git 扩展",
	"No Git repositories available": "没有可用的 Git 仓库",
	"Repository not found for provided SCM": "未找到指定 SCM 对应的仓库",
	"No models configured for commit message generation. Please set 'useForCommitGeneration' to true for at least one model in your configuration.":
		"未配置用于生成提交消息的模型。请在配置中将至少一个模型的 'useForCommitGeneration' 设为 true。",
	"{0} is no longer available as a free model. Please use a different model.": "{0} 已结束免费使用，请使用其他模型。",
"Failed to generate commit message:": "生成提交消息失败：",
	"[Commit Generation Failed]": "[提交生成失败]",
	"empty API response": "API 返回为空",

	// Timeout error
	"Request timed out. The generation took too long. You can increase the timeout in settings (opencodegosniffer.requestTimeout).":
		"请求超时，生成内容过长。您可以在设置中增加超时时间（opencodegosniffer.requestTimeout）。",
	"The connection was closed by the server. The generation took too long. Please try again or request shorter content.":
		"服务端连接被关闭，生成内容过长时间过长。请重试或请求较短的内容。",

	// reasoning effort labels (keys are English fallback text)
	"Disabled": "禁用思考",
	"Thinking": "思考",
	"Low": "低",
	"Medium": "中",
	"High": "高",
	"Maximum": "极高",

	// reasoning effort descriptions (keys are English fallback text)
	"Do not enable thinking": "不启用思考",
	"Enable thinking": "启用思考",
	"Reduce thinking, faster response": "减少思考，响应更快",
	"Balance thinking and speed": "平衡思考与速度",
	"Deeper thinking, slower response": "更深入的思考，但速度较慢",
	"Maximum thinking depth, slowest response": "最大思考深度，速度最慢",

	// reasoning effort title (key is English fallback text)
	"Reasoning Effort": "推理强度",

	// vision proxy
	"Reading image...": "正在阅读图片...",
	" done": " 完成",

	// extension.ts - model preset (setModelPreset command)
	"Custom (manual input)": "自定义 (手动输入)",
	" (current)": " (当前)",
	"(current, temperature: {0}, top_p: {1})": "(当前, 温度: {0}, top_p: {1})",
	"Set Model Preset": "设置模型预设",
	"Select a preset": "选择一个档位",
	"Enter custom temperature": "输入自定义温度",
	"Enter a single number for temperature only (<=2), or two comma-separated numbers for temperature and top_p (temp<=2, top_p<=1), e.g.: 0.7 or 0.7,0.95": "输入一个数字只设温度 (<=2), 输入两个数字用英文逗号分隔同时设温度和 top_p (温度<=2, top_p<=1), 如: 0.7 或 0.7,0.95",
	"Please enter at least temperature value": "请至少输入一个温度值",
	"Please enter at most two numbers separated by a comma": "最多输入两个数值, 用英文逗号分隔",
	"Temperature must be between 0.0 and 2.0": "温度必须在 0.0 到 2.0 之间",
	"top_p must be between 0.0 and 1.0": "top_p 必须在 0.0 到 1.0 之间",
	"Precise": "精确",
	"Balanced": "均衡",
	"Creative": "创意",
	"Extra Creative": "极具创意",
	"Set to temperature: {0} ({1})": "已设为温度 {0} ({1})",
	"Set to temperature: {0} (custom)": "已设为温度 {0} (自定义)",
	"Set to temp: {0}, top_p: {1} (custom)": "已设为温度 {0}, top_p {1} (自定义)",

	// OpenCode usage credentials
	"OpenCode Usage URL": "OpenCode 用量 URL",
	"Paste your OpenCode workspace usage URL, for example https://opencode.ai/workspace/wrk_.../usage": "粘贴你的 OpenCode 工作区用量 URL，例如 https://opencode.ai/workspace/wrk_.../usage",
	"Usage URL is required.": "用量 URL 是必填项。",
	"Usage URL must contain a workspace id like wrk_...": "用量 URL 必须包含类似 wrk_... 的工作区 ID。",
	"OpenCode Auth Cookie": "OpenCode Auth Cookie",
	"Paste your OpenCode auth cookie. You can paste either auth=... or the raw auth value.": "粘贴你的 OpenCode auth cookie。可以粘贴 auth=...，也可以粘贴原始 auth 值。",
	"Auth cookie is required.": "Auth cookie 是必填项。",
	"OpenCode x-server-id": "OpenCode x-server-id",
	"Optional. Required only for detailed usage rows. Copy it from DevTools Network request headers on the OpenCode usage page.": "可选。仅详细用量记录需要。从 OpenCode 用量页面的 DevTools Network 请求头中复制。",
	"OpenCode usage credentials saved.": "OpenCode 用量凭据已保存。",
	"Refreshing OpenCode usage...": "正在刷新 OpenCode 用量...",
	"OpenCode usage status refreshed.": "OpenCode 用量状态已刷新。",
	"Clear stored OpenCode usage URL, auth cookie and x-server-id?": "清除已保存的 OpenCode 用量 URL、auth cookie 和 x-server-id？",
	"Clear": "清除",
	"Could not open the dashboard through VS Code port forwarding. Falling back to the configured dashboard URL.": "无法通过 VS Code 端口转发打开面板。将回退到配置的面板 URL。",
	"OpenCode usage credentials cleared.": "OpenCode 用量凭据已清除。",
};

const es: Record<string, string> = {
	// statusBar
	"Token Count": "Contador de tokens",
	"Current model token usage": "Uso de tokens del modelo actual",
	"Token Usage": "Uso de tokens",
	"Ready": "Listo",

	// extension.ts - API key prompts
	"OpenCode GO Sniffer API Key": "Clave API de OpenCode GO Sniffer",
	"Update your OpenCode GO API key": "Actualizar tu clave API de OpenCode GO",
	"Enter your OpenCode GO API key": "Introduce tu clave API de OpenCode GO",
	"OpenCode GO API key cleared.": "Clave API de OpenCode GO eliminada.",
	"OpenCode GO API key saved.": "Clave API de OpenCode GO guardada.",

	// provider.ts
	"OpenCode GO API key not found": "No se ha encontrado la clave API de OpenCode GO",
	"Invalid base URL configuration.": "Configuración de Base URL no válida.",

	// statusBar cache tooltip
	"Cache": "Caché",
	"({0} cached, {1}%)": "({0} en caché, {1}%)",
	"No changes found in any workspace repositories.": "No se han encontrado cambios en ningún repositorio del workspace.",
	"Git extension not found": "No se ha encontrado la extensión de Git",
	"No Git repositories available": "No hay repositorios Git disponibles",
	"Repository not found for provided SCM": "No se ha encontrado el repositorio para el SCM proporcionado",
	"No models configured for commit message generation. Please set 'useForCommitGeneration' to true for at least one model in your configuration.":
		"No hay modelos configurados para generar mensajes de commit. Establece 'useForCommitGeneration' en true para al menos un modelo de tu configuración.",
	"{0} is no longer available as a free model. Please use a different model.": "{0} ya no está disponible como modelo gratuito. Usa otro modelo.",
	"Failed to generate commit message:": "Error al generar el mensaje de commit:",
	"[Commit Generation Failed]": "[Error al generar el commit]",
	"empty API response": "respuesta vacía de la API",

	// Timeout error
	"Request timed out. The generation took too long. You can increase the timeout in settings (opencodegosniffer.requestTimeout).":
		"La petición ha agotado el tiempo de espera. La generación ha tardado demasiado. Puedes aumentar el timeout en la configuración (opencodegosniffer.requestTimeout).",
	"The connection was closed by the server. The generation took too long. Please try again or request shorter content.":
		"El servidor cerró la conexión. La generación tardó demasiado. Inténtalo de nuevo o pide una respuesta más corta.",

	// reasoning effort labels
	"Disabled": "Desactivado",
	"Thinking": "Razonamiento",
	"Low": "Bajo",
	"Medium": "Medio",
	"High": "Alto",
	"Maximum": "Máximo",

	// reasoning effort descriptions
	"Do not enable thinking": "No activar razonamiento",
	"Enable thinking": "Activar razonamiento",
	"Reduce thinking, faster response": "Menos razonamiento, respuesta más rápida",
	"Balance thinking and speed": "Equilibrar razonamiento y velocidad",
	"Deeper thinking, slower response": "Razonamiento más profundo, respuesta más lenta",
	"Maximum thinking depth, slowest response": "Máxima profundidad de razonamiento, respuesta más lenta",

	// reasoning effort title
	"Reasoning Effort": "Nivel de razonamiento",

	// vision proxy
	"Reading image...": "Leyendo imagen...",
	" done": " listo",

	// extension.ts - model preset
	"Custom (manual input)": "Personalizado (entrada manual)",
	" (current)": " (actual)",
	"(current, temperature: {0}, top_p: {1})": "(actual, temperatura: {0}, top_p: {1})",
	"Set Model Preset": "Establecer preajuste del modelo",
	"Select a preset": "Selecciona un preajuste",
	"Enter custom temperature": "Introduce una temperatura personalizada",
	"Enter a single number for temperature only (<=2), or two comma-separated numbers for temperature and top_p (temp<=2, top_p<=1), e.g.: 0.7 or 0.7,0.95":
		"Introduce un único número para la temperatura (<=2), o dos números separados por coma para temperature y top_p (temp<=2, top_p<=1), por ejemplo: 0.7 o 0.7,0.95",
	"Please enter at least temperature value": "Introduce al menos un valor de temperatura",
	"Please enter at most two numbers separated by a comma": "Introduce como máximo dos números separados por una coma",
	"Temperature must be between 0.0 and 2.0": "La temperatura debe estar entre 0.0 y 2.0",
	"top_p must be between 0.0 and 1.0": "top_p debe estar entre 0.0 y 1.0",
	"Precise": "Preciso",
	"Balanced": "Equilibrado",
	"Creative": "Creativo",
	"Extra Creative": "Extra creativo",
	"Set to temperature: {0} ({1})": "Temperatura establecida en {0} ({1})",
	"Set to temperature: {0} (custom)": "Temperatura establecida en {0} (personalizado)",
	"Set to temp: {0}, top_p: {1} (custom)": "Temperatura establecida en {0}, top_p {1} (personalizado)",

	// OpenCode usage credentials
	"OpenCode Usage URL": "URL de uso de OpenCode",
	"Paste your OpenCode workspace usage URL, for example https://opencode.ai/workspace/wrk_.../usage": "Pega la URL de uso de tu workspace de OpenCode, por ejemplo https://opencode.ai/workspace/wrk_.../usage",
	"Usage URL is required.": "La URL de uso es obligatoria.",
	"Usage URL must contain a workspace id like wrk_...": "La URL de uso debe contener un ID de workspace como wrk_...",
	"OpenCode Auth Cookie": "Cookie auth de OpenCode",
	"Paste your OpenCode auth cookie. You can paste either auth=... or the raw auth value.": "Pega la cookie auth de OpenCode. Puedes pegar auth=... o el valor auth sin prefijo.",
	"Auth cookie is required.": "La cookie auth es obligatoria.",
	"OpenCode x-server-id": "x-server-id de OpenCode",
	"Optional. Required only for detailed usage rows. Copy it from DevTools Network request headers on the OpenCode usage page.": "Opcional. Solo es necesario para filas de uso detalladas. Cópialo desde los headers de la petición en DevTools Network en la página de uso de OpenCode.",
	"OpenCode usage credentials saved.": "Credenciales de uso de OpenCode guardadas.",
	"Refreshing OpenCode usage...": "Refrescando uso de OpenCode...",
	"OpenCode usage status refreshed.": "Estado de uso de OpenCode refrescado.",
	"Clear stored OpenCode usage URL, auth cookie and x-server-id?": "¿Borrar la URL de uso, la cookie auth y el x-server-id guardados de OpenCode?",
	"Clear": "Borrar",
	"Could not open the dashboard through VS Code port forwarding. Falling back to the configured dashboard URL.": "No se pudo abrir el dashboard mediante el port forwarding de VS Code. Se usará como alternativa la URL configurada del dashboard.",
	"OpenCode usage credentials cleared.": "Credenciales de uso de OpenCode borradas.",

	// local stats server / dashboard commands
	"OpenCode GO Sniffer server could not start: {0}": "No se pudo iniciar el servidor de OpenCode GO Sniffer: {0}",
	"OpenCode GO Sniffer server is disabled.": "El servidor de OpenCode GO Sniffer está desactivado.",
	"OpenCode GO Sniffer server running at {0}": "Servidor de OpenCode GO Sniffer ejecutándose en {0}",
	"OpenCode GO Sniffer local URL copied to clipboard.": "URL local de OpenCode GO Sniffer copiada al portapapeles.",
	"Could not determine an intranet IP address for this machine.": "No se pudo determinar una dirección IP de intranet para esta máquina.",
	"OpenCode GO Sniffer intranet URL copied to clipboard: {0}": "URL de intranet de OpenCode GO Sniffer copiada al portapapeles: {0}",
	"OpenCode GO Sniffer token regenerated. Local: {0} Intranet: {1}": "Token de OpenCode GO Sniffer regenerado. Local: {0} Intranet: {1}",
	"OpenCode GO Sniffer token regenerated. Local: {0}": "Token de OpenCode GO Sniffer regenerado. Local: {0}",
};

/**
 * Get the localized string for the given key.
 * Falls back to the key itself if no translation is available.
 */
export function l10n(key: string): string {
	const language = vscode.env.language;
	if (language.toLowerCase() === "zh-cn" || language.toLowerCase().startsWith("zh")) {
		if (zhCN[key]) {
			return zhCN[key];
		}
	}
	if (language.toLowerCase() === "es" || language.toLowerCase().startsWith("es-")) {
		if (es[key]) {
			return es[key];
		}
	}
	return key;
}

/**
 * Format a localized string with replacements.
 * Usage: l10nFormat("Token Usage: {0} / {1}", "12.5K", "1M")
 */
export function l10nFormat(template: string, ...args: (string | number)[]): string {
	let str = l10n(template);
	for (let i = 0; i < args.length; i++) {
		str = str.replace(`{${i}}`, String(args[i]));
	}
	return str;
}
