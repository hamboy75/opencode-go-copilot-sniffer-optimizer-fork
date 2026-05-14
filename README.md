# OpenCode Go Copilot

[English](#english) | [中文](#中文)

---

## English

> **This is not affiliated with, officially maintained by, or endorsed by OpenCode or Anomaly.**

Integrate [OpenCode Go](https://opencode.ai/go) models into GitHub Copilot Chat as a VS Code extension.

### Usage

1. **Set API Key**: `Ctrl+Shift+P` → `OpenCodeGo: Set OpenCode Go API Key`
2. **Show Models**: Click the settings icon ⚙️ in the model picker → **Language Models** panel → set your desired models to Visible
3. **Select Model**: In the Copilot Chat bottom model picker, choose an "OpenCode Go" model
4. **Start chatting**

### Token Usage Indicator

Once installed, the status bar shows the current context usage and cumulative input/output token counts for OpenCode Go models. DeepSeek models and models that return cache metrics via the OpenAI-compatible format also display the **cumulative cache hit count** and **cache hit rate** in the tooltip.

> Note: Whether non-DeepSeek models display cache data depends on whether the model API returns cache metrics in OpenAI-compatible format. This does not indicate whether the model supports caching — caching support depends on OpenCode Go.

![token_counter](/assets/screenshots/token_counter.png)

### Git Commit Messages

Click the **magic wand** button in the Source Control (SCM) panel to auto-generate a commit message.

### Configuration

Available in `settings.json`:

```json
{
  "opencodego.commitLanguage": "English",
  "opencodego.commitModel": "deepseek-v4-flash",
  "opencodego.commitMessagePrompt": "",
  "opencodego.requestTimeout": 600000,
  "opencodego.recentCommitsCount": 10,
  "opencodego.commitIncludeCommitDiff": false,
  "opencodego.commitAttachContextFiles": true
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `opencodego.commitLanguage` | `English` | Language for Git commit messages |
| `opencodego.commitModel` | `deepseek-v4-flash` | Model ID used for commit generation |
| `opencodego.commitMessagePrompt` | `""` | Custom system prompt for commit message generation |
| `opencodego.requestTimeout` | `600000` | Maximum time (ms) for a single API request. Default is 600000 (10 minutes). Increase if long responses time out. |
| `opencodego.recentCommitsCount` | `10` | Number of recent commits to analyze for style reference when generating commit messages. Set to 0 to disable. |
| `opencodego.commitIncludeCommitDiff` | `false` | Include the actual code changes (diff) of recent commits in the style reference, helping the model generate messages that better match the project's commit style. |
| `opencodego.commitAttachContextFiles` | `true` | Attach AGENTS.md and README.md from the repository root as additional context for commit message generation, helping the model better understand the project. |

> All requests use `temperature: 0` for deterministic output.  
> Models with switchable thinking (e.g., DeepSeek, Qwen) provide reasoning effort levels such as Disabled/High/Maximum.

> **VS Code 1.120+**: To configure thinking effort for a model:
> 1. Click the model name in the Chat model picker to open the dropdown
> 2. Click the **gear icon** ⚙️ to the right of the model name
> 3. Select the desired **Thinking Effort** level
>
> The current effort level is shown next to the model name in the picker button (e.g., "DeepSeek V4 Pro · High"). Directly clicking the label text is not supported — use the gear icon submenu instead.

### Build

```bash
npm install
npm run compile
npm run build      # packages extension.vsix
```

### License

MIT License. This project references code from [oai-compatible-copilot](https://github.com/JohnnyZ93/oai-compatible-copilot).

---

## 中文

> **本插件与 OpenCode 或 Anomaly 无关，也未获得其官方维护或认可。**

将 [OpenCode Go](https://opencode.ai/go) 模型集成到 GitHub Copilot Chat 的 VS Code 扩展。

### 使用

1. **设置 API Key**：`Ctrl+Shift+P` → `OpenCodeGo: Set OpenCode Go API Key`
2. **显示模型**：在模型选择器中点击设置图标 ⚙️ → **语言模型** 面板 → 将需要使用的模型显示
3. **选择模型**：在 Copilot Chat 底部模型选择器中选择 "OpenCode Go" 下的模型
4. **开始对话**

### Token 用量指示器

安装后，使用 OpenCode Go 提供的模型时，状态栏会显示当前上下文用量与累计输入/输出 Token 量。DeepSeek 和通过 OpenAI 格式返回缓存用量的模型还会显示**累计缓存命中量**与**缓存命中率**。

> 提示: 非 DeepSeek 的模型是否显示缓存数据取决于模型接口是否通过 OpenAI 格式返回缓存数据，这并不代表此模型是否支持缓存。模型对于缓存的支持情况取决于 OpenCode Go。

![token_counter](/assets/screenshots/token_counter.png)

### Git 提交消息

在源代码管理（SCM）面板中点击魔法棒按钮，自动生成 Git 提交消息。

### 配置

可在 `settings.json` 中配置：

```json
{
  "opencodego.commitLanguage": "Chinese (Simplified)",
  "opencodego.commitModel": "deepseek-v4-flash",
  "opencodego.commitMessagePrompt": "",
  "opencodego.requestTimeout": 600000,
  "opencodego.recentCommitsCount": 10,
  "opencodego.commitIncludeCommitDiff": false,
  "opencodego.commitAttachContextFiles": true
}
```

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `opencodego.commitLanguage` | `English` | 提交消息语言 |
| `opencodego.commitModel` | `deepseek-v4-flash` | 用于生成提交消息的模型 |
| `opencodego.commitMessagePrompt` | `""` | 生成提交消息的自定义系统提示词 |
| `opencodego.requestTimeout` | `600000` | 单个 API 请求的最大等待时间（毫秒）。默认 600000（10 分钟）。生成长内容超时时可增大此值。 |
| `opencodego.recentCommitsCount` | `10` | 生成提交消息时参考的近期提交数量，用于学习仓库提交风格。设为 0 可禁用。 |
| `opencodego.commitIncludeCommitDiff` | `false` | 在风格参考中包含历史提交的实际代码变更（diff），帮助模型生成更符合项目提交风格的消息。 |
| `opencodego.commitAttachContextFiles` | `true` | 将仓库根目录的 AGENTS.md 和 README.md 作为额外上下文附加到提交消息生成中，帮助模型更好地理解项目。 |

> 所有请求使用 `temperature: 0` 以确保输出确定性。  
> 支持切换思考模式的模型（如 DeepSeek、Qwen）提供`禁用思考`/`高`/`极高`等推理强度选项。

> **VS Code 1.120+**: 如需修改模型的推理强度：
> 1. 点击 Chat 底部模型选择器中的模型名称，打开下拉菜单
> 2. 点击模型名称右侧的**齿轮图标** ⚙️
> 3. 选择需要的**推理强度**级别
>
> 当前强度级别会显示在模型选择器按钮中（如 "DeepSeek V4 Pro · 极高"），但该文本仅为标签，无法直接点击修改，请使用齿轮图标子菜单。

### 编译

```bash
npm install
npm run compile
npm run build      # 打包为 extension.vsix
```

### 许可

MIT License。参考了 [oai-compatible-copilot](https://github.com/JohnnyZ93/oai-compatible-copilot) 的代码。
