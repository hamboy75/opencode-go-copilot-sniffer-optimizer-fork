# OpenCode Go Copilot Provider — AGENTS.md

> **版本**: 0.4.2 | **最后更新**: 2026-05-04  
> **所有更改必须通过 `npm run compile` / `npx tsc --noEmit` 编译检查无错误通过。**  
> **每次更改后，必须同步更新本文档 (`AGENTS.md`) 以反映代码变更。**

---

## 目录

1. [项目详细介绍](#1-项目详细介绍)
2. [详细逻辑架构](#2-详细逻辑架构)
3. [程序文件索引](#3-程序文件索引)
4. [函数定义大全](#4-函数定义大全)
5. [编译与构建](#5-编译与构建)
6. [开发规范](#6-开发规范)

---

## 1. 项目详细介绍

### 1.1 概述

**OpenCode Go Copilot Provider** 是一个 VS Code 扩展，它将 OpenCode Go 平台的 AI 语言模型集成到 GitHub Copilot Chat 中。用户可以在 VS Code 的 Copilot Chat 界面中选择并使用 OpenCode Go 提供的各种模型（如 DeepSeek、GLM、Qwen、MiMo、MiniMax、Kimi 等系列），享受智能代码补全、聊天对话、Git 提交消息生成等功能。

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| **Chat 模型提供商** | 实现 `LanguageModelChatProvider` 接口，向 VS Code 注册为 `opencodego` 厂商 |
| **多模型支持** | 内置 14 个模型定义，覆盖 6 大模型系列，支持 Thinking/Instruct 双变体 |
| **双 API 模式** | 同时支持 **OpenAI 兼容格式** (`/chat/completions`) 和 **Anthropic 格式** (`/v1/messages`) |
| **流式推理** | 支持 SSE (Server-Sent Events) 流式响应，实时输出文本和工具调用 |
| **Thinking/推理** | 支持模型的推理过程展示 ("thinking" 状态)，包括 XML think 块解析 |
| **工具调用 (Tool Calling)** | 支持 VS Code 的 LanguageModelToolCallPart 机制 |
| **Token 计数** | 使用 `o200k_base` tiktoken 分词器精确统计 token 用量 |
| **状态栏** | 实时显示当前会话 token 使用量、累计用量、缓存命中率 |
| **Git 提交消息生成** | 一键生成 Conventional Commit 格式的 Git 提交消息 |
| **多仓库支持** | 支持多根工作区 (multi-root) 中多个 Git 仓库的提交消息生成 |
| **国际化** | 内置简体中文 (zh-cn) 中英文双语界面 |
| **重试机制** | 可配置的指数退避重试策略，应对网络抖动和限流 (429) |
| **请求延迟** | 可配置的请求间隔延迟，避免触发 API 限流 |
| **超时控制** | 可配置的请求超时时间（默认 10 分钟） |

### 1.3 模型清单

| 系列 | 模型 ID | 视觉 | 推理模式 | API 格式 |
|------|---------|------|----------|----------|
| GLM | `glm-5.1`, `glm-5` | ❌ | switchable | OpenAI |
| Kimi | `kimi-k2.5`, `kimi-k2.6` | ✅ | always | OpenAI |
| DeepSeek | `deepseek-v4-pro`, `deepseek-v4-flash` | ❌ | switchable | OpenAI |
| MiMo | `mimo-v2-pro`, `mimo-v2-omni`, `mimo-v2.5-pro`, `mimo-v2.5` | mimo-v2-omni ✅ | always | OpenAI |
| MiniMax | `minimax-m2.7`, `minimax-m2.5` | ❌ | always | OpenAI (m2.7 使用 Anthropic) |
| Qwen | `qwen3.6-plus`, `qwen3.5-plus` | ✅ | switchable | OpenAI |

> **switchable**: 注册两个变体 — `Instruct`（无推理）和 `Thinking`（启用推理）。  
> **always**: 推理始终启用，只注册一个条目。

---

## 2. 详细逻辑架构

### 2.1 总体数据流

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VS Code Copilot Chat                         │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  用户发送消息 → LanguageModelChatProvider                     │  │
│  │                    ↓                                          │  │
│  │  OpenCodeGoChatModelProvider (provider.ts)                    │  │
│  │   1. 获取模型配置 (getBuiltInModelConfig)                     │  │
│  │   2. 获取 API Key (SecretStorage)                             │  │
│  │   3. 计算 Token 用量 (provideToken → statusBar)               │  │
│  │   4. 应用请求延迟 (delay)                                     │  │
│  │   5. 构建请求 → API 路由选择                                  │  │
│  │      ├─ apiMode="openai"    → OpenaiApi                       │  │
│  │      └─ apiMode="anthropic" → AnthropicApi                    │  │
│  │   6. 发送 HTTP 请求 (fetch with undici + 超时控制)             │  │
│  │   7. 流式解析响应 → Progress<LanguageModelResponsePart2>      │  │
│  │      ├─ LanguageModelTextPart     (文本)                      │  │
│  │      ├─ LanguageModelThinkingPart (推理过程)                  │  │
│  │      └─ LanguageModelToolCallPart (工具调用)                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        Git 提交消息生成                              │
│  SCM 标题栏按钮 → generateCommitMsg()                              │
│    → 获取 Git Diff (gitUtils.ts)                                   │
│    → 获取最近提交风格参考                                          │
│    → 构建 prompt → 调用 API (OpenaiApi/AnthropicApi)               │
│    → 流式输出到 SCM InputBox                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 扩展激活流程

```
activate(context)
  ├── logger.init()                    ← 创建 LogOutputChannel
  ├── TokenizerManager.initialize()    ← 加载 o200k_base.tiktoken
  ├── initStatusBar()                  ← 创建状态栏条目
  ├── new OpenCodeGoChatModelProvider() ← 创建 Provider 实例
  ├── vscode.lm.registerLanguageModelChatProvider("opencodego", provider)
  ├── 注册命令:
  │   ├── opencodego.setApiKey           ← 设置 API Key
  │   ├── opencodego.generateGitCommitMessage ← 生成提交消息
  │   └── opencodego.abortGitCommitMessage    ← 中止生成
  └── 注册 dispose 清理
```

### 2.3 聊天请求处理流程

```
provideLanguageModelChatResponse(model, messages, options, progress, token)
  │
  ├── 1. 解析模型 ID → getBuiltInModelConfig(model.id)
  │       格式: "baseId::configId" → { baseId, configId }
  │       switchable: Instruct/Thinking 变体
  │       always: 单一条目
  │
  ├── 2. 应用用户配置的 reasoningEffort
  │
  ├── 3. 确定 API 模式 (apiMode: "openai" | "anthropic")
  │
  ├── 4. 记录请求开始日志
  │
  ├── 5. 更新状态栏 Token 用量
  │
  ├── 6. 应用请求延迟 (delay)
  │
  ├── 7. 确保 API Key 存在
  │
  ├── 8. 创建请求超时 AbortController
  │      └── 连接 VS Code 取消令牌 → abort()
  │
  ├── 9. 创建 undici fetch (自定义 bodyTimeout)
  │
  ├── 10. 根据 apiMode 路由:
  │
  │     ├── OpenAI 模式:
  │     │   ├── OpenaiApi.convertMessages()    ← 消息格式转换
  │     │   ├── OpenaiApi.prepareRequestBody()  ← 构建请求体
  │     │   ├── POST /chat/completions          ← 发送请求
  │     │   ├── executeWithRetry()              ← 可重试
  │     │   └── OpenaiApi.processStreamingResponse()
  │     │       ├── SSE 行解析 ("data: ...")
  │     │       ├── processDelta() → 处理每个 delta
  │     │       │   ├── 推理内容 (thinking/reasoning/reasoning_content)
  │     │       │   ├── XML think 块解析 (꽁...꽁)
  │     │       │   ├── 文本内容 → LanguageModelTextPart
  │     │       │   └── 工具调用 → LanguageModelToolCallPart
  │     │       └── 用量统计 (usage chunk)
  │     │
  │     └── Anthropic 模式:
  │         ├── AnthropicApi.convertMessages()   ← 消息格式转换
  │         ├── AnthropicApi.prepareRequestBody() ← 构建请求体
  │         ├── POST /v1/messages               ← 发送请求
  │         ├── executeWithRetry()               ← 可重试
  │         └── AnthropicApi.processStreamingResponse()
  │             ├── SSE 行解析 ("data: ...")
  │             └── processAnthropicChunk()
  │                 ├── content_block_start → 块开始
  │                 ├── content_block_delta → 增量内容
  │                 │   ├── text_delta      → 文本
  │                 │   ├── thinking_delta  → 推理
  │                 │   └── input_json_delta → 工具参数
  │                 └── content_block_stop/message_stop → 结束
  │
  ├── 11. 错误处理:
  │        ├── 超时 (aborted) → 友好超时提示
  │        ├── 连接被终止 → 友好终止提示
  │        └── 其他错误 → 原样抛出
  │
  └── 12. finally: 清理定时器, 记录请求结束日志
```

### 2.4 Thinking/推理内容处理

```
推理内容来源 (OpenAI 模式):
  ├── choice.thinking (对象/字符串)
  ├── delta.reasoning_content (字符串)
  ├── delta.reasoning (对象)
  ├── delta.thinking (对象)
  └── reasoning_details[] (OpenRouter 格式)
      ├── reasoning.summary → summary 字段
      ├── reasoning.text    → text 字段
      └── reasoning.encrypted → "[REDACTED]"

处理机制:
  1. bufferThinkingContent(text) → 积累到 _thinkingBuffer
  2. 每 100ms 定时刷新 → LanguageModelThinkingPart
  3. XML think 块 (꽁...꽁) → processXmlThinkBlocks()
  4. 文本内容出现时 → reportEndThinking()
```

### 2.5 工具调用处理

```
工具调用流 (OpenAI 模式):
  delta.tool_calls[]
    ├── index: 工具调用索引
    ├── id: 调用 ID
    ├── function.name: 函数名
    └── function.arguments: JSON 参数 (可能分片)

处理机制:
  1. _toolCallBuffers Map<index, {id, name, args}>
  2. stream 分片拼接 args
  3. tryEmitBufferedToolCall() → 参数可解析 JSON 时立即发射
  4. flushToolCallBuffers() → finish_reason 时强制发射剩余
  5. adjustReadFileParameters() → 自动扩增 read_file 行数
```

### 2.6 Git 提交消息生成流程

```
generateCommitMsg(secrets, scm?)
  ├── 检测 Git 扩展和仓库
  ├── 获取 Git Diff (gitUtils.getGitDiff)
  │   ├── 优先 staged diff (git diff --cached)
  │   └── 回退 unstaged diff (git diff)
  ├── 多仓库处理:
  │   ├── 0 个有变化的仓库 → 提示用户
  │   ├── 1 个 → 直接生成
  │   └── 多个 → QuickPick 选择
  ├── 构建 Prompt:
  │   ├── 系统提示词 (可自定义)
  │   ├── 最近提交风格参考 (git log --format=%s)
  │   ├── 用户当前输入 (SCM InputBox)
  │   └── Git Diff 内容
  ├── 调用 API:
  │   ├── OpenaiApi.createMessage() / AnthropicApi.createMessage()
  │   └── 流式输出到 SCM InputBox
  └── 清理: 移除 ``` 标记和 <think> 标签
```

---

## 3. 程序文件索引

### 3.1 目录结构

```
src/
├── extension.ts                          # 扩展入口 (activate/deactivate)
├── provider.ts                           # Chat 模型提供商 (核心主文件)
├── models.ts                             # 内置模型定义清单
├── types.ts                              # TypeScript 类型定义
├── commonApi.ts                          # API 抽象基类
├── provideModel.ts                       # 模型信息提供函数
├── provideToken.ts                       # Token 计数函数
├── utils.ts                              # 通用工具函数
├── statusBar.ts                          # 状态栏管理
├── logger.ts                             # 日志系统
├── localize.ts                           # 国际化/本地化
├── versionManager.ts                     # 版本信息管理
├── openai/
│   ├── openaiApi.ts                      # OpenAI 兼容 API 实现
│   └── openaiTypes.ts                    # OpenAI 类型定义
├── anthropic/
│   ├── anthropicApi.ts                   # Anthropic API 实现
│   └── anthropicTypes.ts                 # Anthropic 类型定义
├── gitCommit/
│   ├── commitMessageGenerator.ts         # Git 提交消息生成
│   └── gitUtils.ts                       # Git 工具函数
└── tokenizer/
    ├── tokenizerManager.ts               # Tokenizer 管理 (o200k_base)
    └── imageUtils.ts                     # 图片尺寸解析
```

### 3.2 文件详细说明

| 文件 | 行数 | 职责 |
|------|------|------|
| `extension.ts` | ~45 | 扩展激活/停用，注册 Provider 和命令 |
| `provider.ts` | ~280 | 实现 `LanguageModelChatProvider`，处理聊天请求全流程 |
| `models.ts` | ~230 | 14 个内置模型定义，模型配置查询 |
| `types.ts` | ~80 | `OpenCodeGoModelItem`, `ModelsResponse`, `RetryConfig` 等类型 |
| `commonApi.ts` | ~300 | `CommonApi<TMessage,TRequestBody>` 抽象基类 |
| `provideModel.ts` | ~25 | 模型信息获取 |
| `provideToken.ts` | ~100 | Token 用量计算 |
| `utils.ts` | ~220 | 工具函数 (重试、角色映射、工具转换等) |
| `statusBar.ts` | ~140 | 状态栏创建、更新、累计计数器 |
| `logger.ts` | ~50 | 日志输出 (LogOutputChannel) |
| `localize.ts` | ~70 | 中英文国际化 |
| `versionManager.ts` | ~35 | 扩展版本信息 |
| `openai/openaiApi.ts` | ~430 | OpenAI 格式 API 实现 (消息转换/请求构建/流式处理) |
| `openai/openaiTypes.ts` | ~60 | OpenAI 类型定义 |
| `anthropic/anthropicApi.ts` | ~400 | Anthropic 格式 API 实现 |
| `anthropic/anthropicTypes.ts` | ~120 | Anthropic 类型定义 |
| `gitCommit/commitMessageGenerator.ts` | ~260 | Git 提交消息生成逻辑 |
| `gitCommit/gitUtils.ts` | ~190 | Git 命令封装 |
| `tokenizer/tokenizerManager.ts` | ~130 | o200k_base 分词器管理 (含 LRU 缓存) |
| `tokenizer/imageUtils.ts` | ~130 | 图片尺寸解析 (PNG/GIF/JPEG/WebP) |

---

## 4. 函数定义大全

### 4.1 `src/extension.ts`

#### `activate(context: vscode.ExtensionContext): void`
扩展激活入口。初始化日志、分词器、状态栏；注册 `LanguageModelChatProvider`；注册三条命令（设置 API Key、生成 Git 提交消息、中止生成）。

#### `deactivate(): void`
扩展停用。清理资源（日志 dispose）。

---

### 4.2 `src/provider.ts`

#### `class OpenCodeGoChatModelProvider implements LanguageModelChatProvider`
核心 Provider 类。

| 属性 | 类型 | 说明 |
|------|------|------|
| `_lastRequestTime` | `number \| null` | 上次请求完成时间，用于延迟计算 |

#### `constructor(secrets: vscode.SecretStorage, statusBarItem: vscode.StatusBarItem)`
构造函数，接收密钥存储和状态栏条目。

#### `private _createFetchWithTimeout(requestTimeoutMs: number): typeof fetch`
创建 undici fetch 实例，设置自定义 `bodyTimeout` 防止流式响应中 TCP 空闲连接被提前关闭。回退到全局 `fetch`。

#### `provideLanguageModelChatInformation(options, _token): Promise<LanguageModelChatInformation[]>`
获取可用的语言模型列表。委托给 `prepareLanguageModelChatInformation()`。

#### `provideTokenCount(_model, text, _token): Promise<number>`
计算文本或消息的 Token 数量。委托给 `countMessageTokens()`。

#### `provideLanguageModelChatResponse(model, messages, options, progress, token): Promise<void>`
核心方法：处理聊天请求，流式返回响应。包括模型配置获取、API Key 验证、延迟控制、超时管理、API 路由、流式解析和错误处理。

#### `private async ensureApiKey(): Promise<string | undefined>`
确保 API Key 存在于 SecretStorage 中，缺失时弹出输入框提示用户输入。

---

### 4.3 `src/models.ts`

#### `interface BuiltInModelDef`
内置模型定义接口。

| 属性 | 类型 | 说明 |
|------|------|------|
| `baseId` | `string` | API 请求中使用的模型 ID |
| `displayName` | `string` | 用户友好的显示名称 |
| `vision` | `boolean` | 是否支持图片输入 |
| `thinkingMode` | `"switchable" \| "always"` | switchable=注册两个变体, always=强制推理 |
| `defaultReasoningEffort` | `string` (可选) | 默认推理力度 |
| `supportedReasoningEfforts` | `string[]` (可选) | 支持的推理力度选项 |
| `includeReasoningInRequest` | `boolean` (可选) | 是否在 assistant 消息中包含 reasoning_content |
| `contextLength` | `number` (可选) | 默认上下文长度 |
| `maxTokens` | `number` (可选) | 默认最大输出 Token |
| `extra` | `Record<string, unknown>` (可选) | 额外的请求体参数 |
| `apiMode` | `"openai" \| "anthropic"` (可选) | API 格式模式 |

#### `const BUILT_IN_MODELS: BuiltInModelDef[]`
14 个内置模型定义常量数组。

#### `getBuiltInModelInfos(): LanguageModelChatInformation[]`
将内置模型定义转换为 VS Code 的模型信息列表。switchable 模型展开为 Instruct 和 Thinking 两个变体，并为支持 reasoningEffort 的模型附加 `configurationSchema`。

#### `getBuiltInModelCount(): number`
计算展开后的模型条目总数。

#### `getBuiltInModelConfig(modelId: string): OpenCodeGoModelItem | undefined`
解析模型 ID (`baseId::configId`) 并返回对应的模型配置对象，包括推理模式、API 模式、extra 参数等。

---

### 4.4 `src/types.ts`

#### `interface OpenCodeGoModelItem`
完整模型配置接口。

| 属性 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 模型 ID |
| `owned_by` | `string` | 提供商 |
| `configId` | `string` (可选) | 配置 ID (Instruct/Thinking) |
| `displayName` | `string` (可选) | 显示名称 |
| `baseUrl` | `string` (可选) | 自定义 Base URL |
| `context_length` | `number` (可选) | 上下文长度 |
| `vision` | `boolean` (可选) | 是否支持视觉 |
| `max_completion_tokens` | `number` (可选) | 最大输出 Token (新标准) |
| `reasoning_effort` | `string` (可选) | 推理力度 |
| `enable_thinking` | `boolean` (可选) | 是否启用 thinking |
| `thinking_budget` | `number` (可选) | Thinking 预算 Token |
| `temperature` | `number \| null` (可选) | 温度参数 |
| `top_p` | `number \| null` (可选) | Top-p 采样 |
| `top_k` | `number` (可选) | Top-k 采样 |
| `min_p` | `number` (可选) | Min-p 采样 |
| `frequency_penalty` | `number` (可选) | 频率惩罚 |
| `presence_penalty` | `number` (可选) | 存在惩罚 |
| `repetition_penalty` | `number` (可选) | 重复惩罚 |
| `reasoning` | `object` (可选) | OpenRouter 推理配置 |
| `extra` | `Record<string, unknown>` (可选) | 额外请求体参数 |
| `family` | `string` (可选) | 模型系列 |
| `include_reasoning_in_request` | `boolean` (可选) | 是否在请求中包含推理内容 |
| `useForCommitGeneration` | `boolean` (可选) | 是否用于提交消息生成 |
| `delay` | `number` (可选) | 模型专属请求延迟 |
| `apiMode` | `string` (可选) | API 模式 |
| `headers` | `Record<string, string>` (可选) | 自定义 HTTP 头 |

#### `interface ModelsResponse`
`{ object: string; data: ModelItem[] }` — 模型列表 API 响应。

#### `interface ModelItem`
`{ id, object?, created?, owned_by? }` — 单个模型条目。

#### `interface RetryConfig`
`{ enabled, maxAttempts, intervalMs, backoffFactor, maxIntervalMs, statusCodes }` — 重试配置。

---

### 4.5 `src/commonApi.ts`

#### `interface StreamUsage`
`{ promptTokens, completionTokens, cacheHitTokens?, cacheMissTokens? }` — 流式用量信息。

#### `abstract class CommonApi<TMessage, TRequestBody>`
API 实现的抽象基类。

| 属性 | 类型 | 说明 |
|------|------|------|
| `_toolCallBuffers` | `Map<number, {id?, name?, args}>` | 工具调用参数缓冲区 |
| `_completedToolCallIndices` | `Set<number>` | 已完成发射的工具调用索引 |
| `_hasEmittedAssistantText` | `boolean` | 是否已发射过助手文本 |
| `_hasEmittedText` | `boolean` | 是否已发射过文本 |
| `_hasEmittedThinking` | `boolean` | 是否已发射过推理内容 |
| `_emittedBeginToolCallsHint` | `boolean` | 是否已发射工具调用前导空格 |
| `_xmlThinkActive` | `boolean` | XML think 块解析中 |
| `_xmlThinkDetectionAttempted` | `boolean` | 是否尝试过 XML think 检测 |
| `_currentThinkingId` | `string \| null` | 当前推理内容 ID |
| `_thinkingBuffer` | `string` | 推理内容缓冲区 |
| `_thinkingFlushTimer` | `NodeJS.Timeout \| null` | 推理刷新定时器 |
| `_systemContent` | `string \| undefined` | 系统提示内容 |
| `_modelId` | `string` | 模型 ID |
| `_onUsage` | `((usage: StreamUsage) => void) \| undefined` | 用量回调 |

#### `abstract convertMessages(messages, modelConfig): TMessage[]`
将 VS Code 聊天消息转换为特定 API 格式的消息数组。

#### `abstract prepareRequestBody(rb, um, options?): TRequestBody`
构建特定 API 的请求体。

#### `abstract processStreamingResponse(responseBody, progress, token): Promise<void>`
处理特定 API 的流式响应。

#### `protected tryEmitBufferedToolCall(index, progress): Promise<void>`
当工具调用的名称和 JSON 参数都可用时，尝试发射缓冲的工具调用。

#### `protected flushToolCallBuffers(progress, throwOnInvalid): Promise<void>`
清空所有工具调用缓冲区，发射剩余的工具调用。

#### `protected adjustReadFileParameters(toolName, parameters): Record<string, unknown>`
调整 `read_file` 工具的参数，根据配置自动扩增读取行数。

#### `protected reportEndThinking(progress): void`
结束当前推理序列，向 VS Code 报告推理结束。

#### `protected generateThinkingId(): string`
生成唯一的推理内容 ID。

#### `protected bufferThinkingContent(text, progress): void`
缓冲推理内容，设置定时器每 100ms 刷新。

#### `protected flushThinkingBuffer(progress): void`
立即将缓冲的推理内容刷新到进度报告器。

#### `protected processXmlThinkBlocks(content, progress): { emittedAny: boolean }`
解析 XML think 块 (`꽁...꽁`)，将推理内容与文本内容分离。

#### `protected processTextContent(content, progress): { emittedAny: boolean }`
处理普通文本内容，发射到进度报告器。

#### `static prepareHeaders(apiKey, apiMode, customHeaders?): Record<string, string>`
准备 HTTP 请求头。Anthropic 模式使用 `x-api-key`，OpenAI 模式使用 `Bearer` 令牌。

---

### 4.6 `src/provideModel.ts`

#### `prepareLanguageModelChatInformation(options, _token, _secrets): Promise<LanguageModelChatInformation[]>`
获取模型信息列表。当前使用硬编码的内置模型列表（委托 `getBuiltInModelInfos()`），记录日志后返回。

---

### 4.7 `src/provideToken.ts`

#### `const BaseTokensPerMessage = 3`
每条消息的基础 Token 数。

#### `const BaseTokensPerName = 1`
每个名称的基础 Token 数。

#### `countMessageTokens(text, modelConfig): Promise<number>`
计算消息的总 Token 数。支持 `LanguageModelTextPart`、`LanguageModelDataPart`（图片/二进制）、`LanguageModelToolCallPart`、`LanguageModelToolResultPart`、`LanguageModelThinkingPart`。

#### `textTokenLength(text): Promise<number>`
使用 tiktoken 分词器计算文本的 Token 数。

#### `countToolTokens(tools): Promise<number>`
计算工具定义的总 Token 数。

#### `calculateImageTokenCost(dataUrl): number`
基于图片尺寸计算 Token 成本。使用 512px 磁贴算法：基础 85 Token + 每磁贴 170 Token。

#### `calculateNonImageBinaryTokens(byteLength): number`
计算非图片二进制数据的 Token 成本（约 0.75 Token/字节）。

---

### 4.8 `src/utils.ts`

#### `interface ParsedModelId`
`{ baseId: string; configId?: string }` — 解析后的模型 ID。

#### `getModelProviderId(model): string`
从模型对象中提取提供商 ID，依次检查 `owned_by`、`provide`、`provider`、`ownedBy`、`owner`、`vendor` 字段。

#### `normalizeUserModels(models): OpenCodeGoModelItem[]`
规范化用户自定义模型列表，为每个模型设置 `owned_by` 字段。

#### `parseModelId(modelId): ParsedModelId`
解析模型 ID，按 `::` 分隔为 `baseId` 和 `configId`。

#### `mapRole(message): "user" | "assistant" | "system"`
将 VS Code 消息角色映射为字符串角色。

#### `convertToolsToOpenAI(options?): { tools?, tool_choice? }`
将 VS Code 工具定义转换为 OpenAI 函数工具定义。

#### `createRetryConfig(): RetryConfig`
从 VS Code 设置中读取重试配置。

#### `executeWithRetry<T>(fn, retryConfig): Promise<T>`
使用指数退避策略执行可重试的异步操作。

#### `isRetryableError(error, retryableStatusCodes): boolean`
判断错误是否可重试（网络错误 + 指定 HTTP 状态码）。

#### `isImageMimeType(mimeType): boolean`
判断 MIME 类型是否为图片。

#### `createDataUrl(part): string`
从 `LanguageModelDataPart` 创建 Base64 Data URL。

#### `arrayBufferToBase64(buffer): string`
将 Uint8Array 转换为 Base64 字符串。

#### `isToolResultPart(part): boolean`
判断是否为 `LanguageModelToolResultPart`。

#### `collectToolResultText(part): string`
收集工具结果中的文本内容。

#### `tryParseJSONObject(text): { ok: true, value } | { ok: false }`
安全尝试解析 JSON 对象字符串。

---

### 4.9 `src/statusBar.ts`

#### `initStatusBar(context): vscode.StatusBarItem`
创建状态栏条目，重置累计计数器，显示 "Ready"。

#### `formatTokenCount(value): string`
格式化 Token 数为人类可读格式 (K/M/B)。

#### `createProgressBar(usedTokens, maxTokens): string`
创建视觉进度条（使用 Unicode 块字符 ▁▂▃▄▅▆▇█）。

#### `updateContextStatusBar(messages, tools, model, statusBarItem, modelConfig): Promise<void>`
更新状态栏文本：显示当前消息的 Token 用量和进度条。新对话时重置累计计数器。

#### `resetCumulativeCounters(): void`
重置所有累计 Token 计数器（VS Code 启动和新对话时调用）。

#### `recordUsage(usage: StreamUsage): void`
将流式用量累计到全局计数器。

#### `updateCumulativeTooltip(statusBarItem): void`
更新状态栏工具提示，显示累计输入/输出 Token 数和缓存命中率。

---

### 4.10 `src/logger.ts`

#### `class Logger`

| 方法 | 说明 |
|------|------|
| `init()` | 创建 VS Code `LogOutputChannel("OpenCodeGo")` |
| `debug(tag, data)` | 输出 DEBUG 级别日志 |
| `info(tag, data)` | 输出 INFO 级别日志 |
| `warn(tag, data)` | 输出 WARN 级别日志 |
| `error(tag, data)` | 输出 ERROR 级别日志 |
| `sanitizeHeaders(headers)` | 脱敏敏感 HTTP 头 (Authorization, x-api-key 等) |
| `dispose()` | 清理输出通道 |

#### `export const logger = new Logger()`
单例导出。

---

### 4.11 `src/localize.ts`

#### `l10n(key): string`
获取当前语言的本地化字符串。当前支持简体中文 (`zh-cn`)，回退到英文 key。

#### `l10nFormat(template, ...args): string`
格式化本地化字符串，替换 `{0}`, `{1}` 等占位符。

---

### 4.12 `src/versionManager.ts`

#### `class VersionManager`

| 静态方法 | 说明 |
|----------|------|
| `getVersion(): string` | 获取扩展版本号（从 `package.json` 读取） |
| `getUserAgent(): string` | 构建 User-Agent 字符串 |
| `getClientInfo(): { name, version, author }` | 获取客户端信息 |

---

### 4.13 `src/openai/openaiTypes.ts`

#### `interface OpenAIToolCall`
`{ id, type: "function", function: { name, arguments } }` — OpenAI 工具调用。

#### `interface OpenAIFunctionToolDef`
`{ type: "function", function: { name, description?, parameters? } }` — OpenAI 函数工具定义。

#### `interface OpenAIChatMessage`
`{ role, content?, name?, tool_calls?, tool_call_id?, reasoning_content? }` — OpenAI 聊天消息。

#### `interface ChatMessageContent`
`{ type: "text" | "image_url", text?, image_url? }` — 多模态消息内容。

#### `type OpenAIChatRole`
`"system" | "user" | "assistant" | "tool"` — 聊天角色。

#### `interface ReasoningDetailCommon`
`{ id, format, index? }` — 推理详情公共接口。

#### `interface ReasoningSummaryDetail extends ReasoningDetailCommon`
`{ type: "reasoning.summary", summary }` — 推理摘要。

#### `interface ReasoningEncryptedDetail extends ReasoningDetailCommon`
`{ type: "reasoning.encrypted", data }` — 加密推理内容。

#### `interface ReasoningTextDetail extends ReasoningDetailCommon`
`{ type: "reasoning.text", text, signature? }` — 推理文本。

#### `type ReasoningDetail = ReasoningSummaryDetail | ReasoningEncryptedDetail | ReasoningTextDetail`
推理详情联合类型。

---

### 4.14 `src/openai/openaiApi.ts`

#### `class OpenaiApi extends CommonApi<OpenAIChatMessage, Record<string, unknown>>`

#### `constructor(modelId: string)`
构造函数，传入模型 ID。

#### `convertMessages(messages, modelConfig): OpenAIChatMessage[]`
将 VS Code 消息转换为 OpenAI 格式。支持文本、图片、工具调用、工具结果、推理内容的消息转换。

#### `prepareRequestBody(rb, um?, options?): Record<string, unknown>`
构建 OpenAI 请求体。设置 temperature、top_p、max_tokens、reasoning_effort、thinking 模式、stop、tools、tool_choice 以及各种惩罚参数和 extra 参数。

#### `processStreamingResponse(responseBody, progress, token): Promise<void>`
处理 OpenAI SSE 流式响应。逐行解析 `data:` 前缀的 SSE 事件，处理 `[DONE]` 标记，解析 usage 用量信息，委托 `processDelta()`。

#### `private processDelta(delta, progress): Promise<boolean>`
处理单个 stream delta。按序处理：推理内容 → XML think 块 → 文本内容 → 工具调用。支持 `reasoning_details` 数组（OpenRouter 格式）。

#### `async *createMessage(model, systemPrompt, messages, baseUrl, apiKey, signal?): AsyncGenerator<{ type: "text"; text: string }>`
非流式聊天消息生成器（用于 Git 提交生成）。发送 HTTP 请求后 yield 文本块。

---

### 4.15 `src/anthropic/anthropicTypes.ts`

#### `type AnthropicRole`
`"user" | "assistant"`

#### `interface AnthropicTextBlock`
`{ type: "text", text }` — 文本块。

#### `interface AnthropicImageBlock`
`{ type: "image", source: { type: "base64", media_type, data } }` — 图片块。

#### `interface AnthropicThinkingBlock`
`{ type: "thinking", thinking, signature? }` — 推理块。

#### `interface AnthropicToolUseBlock`
`{ type: "tool_use", id, name, input }` — 工具使用块。

#### `interface AnthropicToolResultBlock`
`{ type: "tool_result", tool_use_id, content, is_error? }` — 工具结果块。

#### `type AnthropicContentBlock`
文本 | 图片 | 推理 | 工具使用 | 工具结果的联合类型。

#### `interface AnthropicMessage`
`{ role, content: string | AnthropicContentBlock[] }` — Anthropic 消息。

#### `interface AnthropicRequestBody`
Anthropic 请求体。包含 `model`, `messages`, `max_tokens`, `system`, `stream`, `temperature`, `top_p`, `top_k`, `thinking`, `tools`, `tool_choice` 等字段。

#### `interface AnthropicToolDefinition`
`{ name, description?, input_schema? }` — Anthropic 工具定义。

#### `type AnthropicToolChoice`
`{ type: "auto" } | { type: "any" } | { type: "tool"; name } | { type: "none" }`

#### `interface AnthropicStreamChunk`
流式响应块的完整定义。包含 `type`（8 种事件类型）、`message`、`content_block`、`delta`、`usage`、`error` 等字段。

---

### 4.16 `src/anthropic/anthropicApi.ts`

#### `class AnthropicApi extends CommonApi<AnthropicMessage, AnthropicRequestBody>`

#### `constructor(modelId: string)`
构造函数，传入模型 ID。

#### `convertMessages(messages, modelConfig): AnthropicMessage[]`
将 VS Code 消息转换为 Anthropic 格式。系统消息提取到 `_systemContent`。支持文本、图片、工具使用、工具结果、推理内容。使用 `content` 块数组格式。

#### `prepareRequestBody(rb, um?, options?): AnthropicRequestBody`
构建 Anthropic 请求体。设置 max_tokens、system、temperature、top_p、top_k、tools（转换为 Anthropic 格式）、tool_choice（auto/any/none）以及 extra 参数。

#### `processStreamingResponse(responseBody, progress, token): Promise<void>`
处理 Anthropic SSE 流式响应。逐行解析 `data:` 前缀的 SSE 事件，委托 `processAnthropicChunk()`。

#### `private processAnthropicChunk(chunk, progress): Promise<void>`
处理 Anthropic 流式块。支持的事件类型：
- `ping` — 忽略
- `error` — 记录错误
- `message_start` — 消息元数据
- `message_delta` — 停止原因和用量
- `content_block_start` — 块开始（text/thinking/tool_use）
- `content_block_delta` — 增量内容（text_delta/thinking_delta/input_json_delta/signature_delta）
- `content_block_stop` / `message_stop` — 清空缓冲区

#### `async *createMessage(model, systemPrompt, messages, baseUrl, apiKey, signal?): AsyncGenerator<{ type: "text"; text: string }>`
非流式消息生成器（Anthropic 模式，用于 Git 提交生成）。

---

### 4.17 `src/gitCommit/commitMessageGenerator.ts`

#### `let commitGenerationAbortController: AbortController | undefined`
全局中止控制器。

#### `const DEFAULT_PROMPT`
默认提示词模板。包含 `system`（系统提示）、`user`（用户输入模板）、`styleReference`（风格参考模板）。

#### `generateCommitMsg(secrets, scm?): Promise<void>`
入口函数。检测 Git 扩展和仓库，对多仓库场景进行选择，调用 `generateCommitMsgForRepository()`。

#### `orchestrateWorkspaceCommitMsgGeneration(secrets, repos): Promise<void>`
多仓库编排。筛选有变化的仓库，0/1/多仓库分别处理。

#### `filterForReposWithChanges(repos): Promise<any[]>`
筛选出有 Git 变更的仓库。

#### `promptRepoSelection(repos): Promise<any>`
弹出 QuickPick 让用户选择仓库（支持"全部生成"）。

#### `generateCommitMsgForRepository(secrets, repository): Promise<void>`
为单个仓库生成提交消息。显示进度条，支持取消。

#### `ensureApiKey(secrets): Promise<string | undefined>`
确保 API Key 存在。

#### `performCommitMsgGeneration(secrets, gitDiff, inputBox, repoPath?): Promise<void>`
核心生成逻辑。构建 prompt（含自定义提示词、最近提交风格、用户输入、diff 内容），创建 API 实例，流式输出提交消息到 InputBox。

#### `abortCommitGeneration(): void`
中止提交消息生成。

#### `extractCommitMessage(str): string`
从生成的文本中提取提交消息（移除代码块标记）。

#### `removeThinkTags(text): string`
移除文本中的 `<think>...</think>` 标签。

---

### 4.18 `src/gitCommit/gitUtils.ts`

#### `interface GitCommit`
`{ hash, shortHash, subject, author, date }` — Git 提交信息。

#### `checkGitRepo(cwd): Promise<boolean>`
检查当前目录是否为 Git 仓库。

#### `checkGitInstalled(): Promise<boolean>`
检查 Git 是否已安装。

#### `checkGitRepoHasCommits(cwd): Promise<boolean>`
检查 Git 仓库是否有提交记录。

#### `searchCommits(query, cwd): Promise<GitCommit[]>`
搜索 Git 提交记录（支持 hash 回退搜索）。

#### `getGitDiff(repoPath): Promise<string | undefined>`
获取 Git Diff。优先 staged diff (`git diff --cached`)，回退 unstaged diff (`git diff`)，限制最多 500 行。

#### `getRecentCommits(repoPath, count): Promise<string>`
获取最近的提交标题作为风格参考。

#### `limitDiffLines(diff, maxLines): string`
限制 diff 行数，超出时添加截断标记。

---

### 4.19 `src/tokenizer/tokenizerManager.ts`

#### `class TokenCache`
简单 LRU 缓存。

| 属性/方法 | 说明 |
|-----------|------|
| `cache` | `Map<string, number>` — 缓存存储 |
| `maxSize` | 最大条目数 (5000) |
| `maxSizeBytes` | 最大字节数 (5MB) |
| `currentSize` | 当前大小 |
| `get(key)` | 获取缓存值，更新最近使用 |
| `set(key, value)` | 设缓存值，超出限制时驱逐最久未使用的条目 |

#### `class TokenizerManager`

| 静态方法 | 说明 |
|----------|------|
| `initialize(extensionPath)` | 设置扩展路径并获取单例 |
| `setExtensionPath(path)` | 设置扩展路径 |
| `getInstance()` | 获取单例实例 |

| 实例方法 | 说明 |
|----------|------|
| `getTokenizer()` | 获取或创建 tiktoken 分词器实例（o200k_base） |
| `countTokens(text)` | 使用缓存和分词器计算文本 Token 数 |

#### `export const tokenizerManager = TokenizerManager.getInstance()`
导出的单例实例。

---

### 4.20 `src/tokenizer/imageUtils.ts`

#### `getImageDimensions(base64): { width, height }`
从 Base64 图片字符串中获取尺寸。根据 MIME 类型分发到不同解析函数。

#### `getMimeType(base64): string`
通过读取文件头字节判断图片类型（JPEG/GIF/WebP/PNG）。

#### `getPngDimensions(base64): { width, height }`
解析 PNG 图片尺寸（读取 IHDR 块）。

#### `getGifDimensions(base64): { width, height }`
解析 GIF 图片尺寸（读取逻辑屏幕描述符）。

#### `getJpegDimensions(base64): { width, height }`
解析 JPEG 图片尺寸（扫描 SOF0/SOF1/SOF2 标记）。

#### `getWebPDimensions(base64String): { width, height }`
解析 WebP 图片尺寸（支持 VP8/VP8L/VP8X 格式）。

---

## 5. 编译与构建

### 5.1 编译命令

```bash
# TypeScript 编译
npm run compile
# 等效于: npx tsc -p ./

# 仅类型检查（无输出）
npx tsc --noEmit

# 持续监视模式
npm run watch

# 打包 VSIX
npm run build
# 等效于: npx @vscode/vsce package -o extension.vsix
```

### 5.2 编译配置 (tsconfig.json)

| 选项 | 值 |
|------|-----|
| `module` | `Node16` |
| `target` | `ES2024` |
| `lib` | `["ES2024", "dom"]` |
| `strict` | `true` |
| `outDir` | `out` |
| `rootDir` | `src` |

### 5.3 依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| `@microsoft/tiktokenizer` | ^1.0.10 | o200k_base 分词器 |
| `@types/node` | ^22 | Node.js 类型定义 |
| `@types/vscode` | ^1.104.0 | VS Code 类型定义 |
| `typescript` | ^5.9.2 | TypeScript 编译器 |

---

## 6. 开发规范

### 6.1 **编译检查铁律**

> **所有代码更改必须通过以下编译检查，确保无错误：**
> ```bash
> npm run compile
> # 或
> npx tsc --noEmit
> ```
> 任何编译错误（包括类型错误）必须在提交前修复。

### 6.2 **AGENTS.md 同步更新铁律**

> **每次代码更改后，必须同步更新 `AGENTS.md`，包括但不限于：**
> - 新增/修改/删除函数、类、接口 → 更新第 4 节（函数定义大全）
> - 新增/删除/重命名文件 → 更新第 3 节（程序文件索引）及第 3.2 节的目录结构和文件说明表
> - 新增/修改/删除模型定义 → 更新第 1.3 节（模型清单）
> - 修改核心逻辑流程 → 更新第 2 节（详细逻辑架构）中的流程图和文字描述
> - 修改编译配置、依赖、构建命令 → 更新第 5 节（编译与构建）
> - 修改开发规范 → 更新第 6 节（开发规范）
> 
> 任何提交中若包含代码变更但未同步更新本文档，视为不合规。

### 6.2 代码风格

- 使用 TypeScript 严格模式 (`strict: true`)
- 遵循 ES2024 标准
- 使用 ESModule 模块系统 (`import`/`export`)
- 所有新的 API 函数需有 JSDoc 注释
- 导出的函数和类必须显式标注类型
- 使用 `satisfies` 操作符确保类型安全

### 6.3 命名约定

| 类别 | 约定 | 示例 |
|------|------|------|
| 类 | PascalCase | `OpenCodeGoChatModelProvider` |
| 接口 | PascalCase | `BuiltInModelDef`, `OpenCodeGoModelItem` |
| 类型 | PascalCase | `OpenAIChatRole`, `ParsedModelId` |
| 函数 | camelCase | `getBuiltInModelConfig`, `countMessageTokens` |
| 变量 | camelCase | `requestTimeoutMs`, `apiKey` |
| 常量 | UPPER_SNAKE_CASE | `BASE_TOKENS_PER_MESSAGE`, `DEFAULT_CONTEXT_LENGTH` |
| 私有属性 | `_` 前缀 | `_lastRequestTime`, `_toolCallBuffers` |
| 文件 | camelCase | `provider.ts`, `commitMessageGenerator.ts` |

### 6.4 VS Code API 使用约束

- `LanguageModelChatProvider` — 必须实现 `provideLanguageModelChatResponse()` 和 `provideLanguageModelChatInformation()`
- `LanguageModelResponsePart2` — 使用 `LanguageModelTextPart`、`LanguageModelThinkingPart`、`LanguageModelToolCallPart`
- `SecretStorage` — 用于安全存储 API Key
- `LogOutputChannel` — 用于结构化日志输出
- `Progress<LanguageModelResponsePart2>` — 用于流式报告响应块

### 6.5 错误处理策略

- 网络请求使用 `executeWithRetry()`（默认 3 次重试，指数退避）
- API 认证失败 → 弹出输入框提示用户输入
- 请求超时 → 友好的本地化错误消息
- 流式解析错误 → 记录日志，继续处理（不中断流）
- 所有未捕获错误由 `provider.ts` 的 `catch` 块统一处理

### 6.6 日志规范

所有日志使用 `logger` 单例，标签格式为 `category.subcategory`：
- `request.start/end` — 请求开始/结束
- `request.error/timeout/delay` — 请求错误/超时/延迟
- `models.loaded` — 模型加载
- `commit.start/end/error` — 提交消息生成
- `openai.stream.*` / `anthropic.stream.*` — 流式处理
- `apiKey.missing` — API Key 缺失

---

*本文档由 AI 自动生成，基于 `opencode-go-copilot-provider` v0.4.2 源码分析。*
