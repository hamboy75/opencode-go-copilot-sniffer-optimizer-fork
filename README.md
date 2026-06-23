<div align="center">

![logo](/assets/logo.png)

# OpenCode GO Copilot Sniffer & Optimizer

Integrate OpenCode GO and optional Zen free models into GitHub Copilot Chat, then inspect, monitor, debug and optimize the traffic sent upstream.

</div>

> [!IMPORTANT]
> **This project is not affiliated with, officially maintained by, or endorsed by OpenCode, Anomaly, GitHub or Microsoft.**

## Acknowledgements and origin

This project exists thanks to the original work by **OnesoftQwQ**, author of the VS Code extension:

https://marketplace.visualstudio.com/items?itemName=OnesoftQwQ.opencode-go-copilot-provider

**OpenCode GO Copilot Sniffer & Optimizer** started as a fork of that provider. The original project made it possible to connect OpenCode GO-compatible models to GitHub Copilot Chat.

This fork has since been extensively modified with a different focus: understanding the communication flow, inspecting what Copilot sends upstream, measuring token usage, exposing a local dashboard, and giving the user control over which parts of the request should be sent, removed, or optimized.

Credit and thanks go to **OnesoftQwQ** for the original foundation.

## What is this?

**OpenCode GO Copilot Sniffer & Optimizer** is a VS Code extension that embeds OpenCode GO-compatible models, including optional Zen free models, into GitHub Copilot Chat and adds a local inspection and optimization layer around the requests.

It started as an OpenCode GO Copilot provider, but this fork adds a full local dashboard to inspect what is being sent, measure token usage, monitor upstream responses, review payloads, estimate pruning savings and optionally reduce unnecessary request data before it reaches the OpenCode server.

## Main features

- OpenCode GO models inside GitHub Copilot Chat.
- Optional OpenCode Zen free models.
- Native Copilot token usage reporting.
- Advanced VS Code status bar token counter.
- Local Sniffer dashboard with token-protected access.
- Request and response inspection.
- Optional full payload capture.
- Clickable JSON tree for request bodies.
- Modal viewer for long fields with real line breaks.
- Request pruning and optimization.
- Preview mode for pruning savings before changing traffic.
- Token and byte savings metrics.
- Dedicated Usage tab.
- Compact `OC 🔎` status bar usage indicator.
- Command Palette setup for OpenCode usage credentials without opening the dashboard.
- OpenCode current quota cards for rolling 5-hour, weekly and monthly usage.
- Reset countdowns read from OpenCode usage data.
- Current-month OpenCode usage detail loading through the `_server` endpoint.
- Usage charts for daily cost and token usage.
- Usage detail table by model, provider, date and session.
- Local, forwarded and intranet dashboard URLs.
- VS Code port forwarding support for Remote SSH dashboard access.
- Dynamic port selection for multiple VS Code instances.
- IP allowlist for intranet access.
- Regenerable dashboard token.
- Git commit message generation.
- Model temperature presets.
- Vision proxy for text-only models.
- Configurable timeout for long-running streams.

## Quick start

1. Install the VSIX in VS Code.
2. Run `Ctrl+Shift+P` → `OpenCode GO Sniffer: Set OpenCode GO API Key`.
3. Open Copilot Chat.
4. Open the model picker.
5. Make OpenCode GO models visible if they are hidden.
6. Select an OpenCode GO model.
7. Start chatting.

If the model does not appear, run:

```text
Ctrl+Shift+P → Developer: Reload Window
```

## API key

Set your API key from the command palette:

```text
OpenCode GO Sniffer: Set OpenCode GO API Key
```

The key is stored in VS Code SecretStorage.

## Local Sniffer dashboard

Open the local dashboard with:

```text
OpenCode GO Sniffer: Open Sniffer Dashboard
```

The dashboard is served by the extension itself. By default it listens on:

```text
127.0.0.1:43177
```

Every installation gets a random token stored in VS Code SecretStorage. Dashboard URLs include this token:

```text
http://127.0.0.1:43177/?token=...
```

The dashboard shows:

- request count;
- running, successful, failed and aborted requests;
- average duration;
- prompt tokens;
- completion tokens;
- pruning savings;
- captured requests;
- captured responses;
- request details;
- JSON tree inspection;
- selected field modal;
- dedicated Sniffer and Usage tabs;
- OpenCode rolling 5-hour, weekly and monthly usage percentages;
- current-month OpenCode usage detail loaded automatically from `_server`;
- local usage charts.

## Dashboard commands

```text
OpenCode GO Sniffer: Open Sniffer Dashboard
OpenCode GO Sniffer: Open Usage Dashboard
OpenCode GO Sniffer: Configure OpenCode Usage Credentials
OpenCode GO Sniffer: Clear OpenCode Usage Credentials
OpenCode GO Sniffer: Refresh OpenCode Usage Status
OpenCode GO Sniffer: Restart Sniffer Server
OpenCode GO Sniffer: Copy Local Sniffer URL
OpenCode GO Sniffer: Copy Intranet Sniffer URL
OpenCode GO Sniffer: Regenerate Sniffer Token
```

## Dynamic ports

The configured port is treated as a base port. If the port is already in use, the extension can automatically try the next ports.

Example:

```json
{
  "opencodegosniffer.localStatsPort": 43177,
  "opencodegosniffer.localStatsPortAutoIncrementMax": 20
}
```

This allows several VS Code or Remote SSH instances to coexist:

```text
43177
43178
43179
...
43197
```

The copy URL commands always use the real active port.

## VS Code port forwarding

By default, dashboard opening commands use VS Code port forwarding when possible.

This is especially useful in Remote SSH sessions because the dashboard can keep listening on:

```text
127.0.0.1:43177
```

and VS Code exposes it safely to your local browser through its forwarded-port mechanism.

This means the normal recommended setup is:

```json
{
  "opencodegosniffer.localStatsHost": "127.0.0.1",
  "opencodegosniffer.localStatsUsePortForwarding": true
}
```

With this setup you usually do **not** need:

- `0.0.0.0`;
- intranet allowlist changes;
- direct access to the remote host LAN IP.

If port forwarding cannot be used, the extension falls back to the configured dashboard URL.

Disable this behavior with:

```json
{
  "opencodegosniffer.localStatsUsePortForwarding": false
}
```

## Intranet access

By default the dashboard listens only on localhost.

To expose it to your LAN:

This is optional and mostly useful when you explicitly want direct LAN access instead of VS Code port forwarding.

```json
{
  "opencodegosniffer.localStatsHost": "0.0.0.0",
  "opencodegosniffer.localStatsAllowedClients": "127.0.0.1,::1,192.168.1.*"
}
```

Supported allowlist formats:

```text
127.0.0.1
192.168.1.5
192.168.1.*
192.168.1.0/24
172.16.0.0/255.255.0.0
*
any
```

> [!WARNING]
> Intranet access still requires the dashboard token, but captured payloads may contain code, prompts, file contents and sensitive data. Do not expose this dashboard outside trusted networks.

## Payload capture

Payload capture is disabled by default.

Enable it only when debugging:

```json
{
  "opencodegosniffer.localStatsCapturePayloads": true
}
```

When enabled, the dashboard can show:

- the body sent upstream;
- response preview;
- full captured response text;
- model ID;
- upstream model ID;
- API mode;
- base URL;
- duration;
- HTTP status;
- usage metrics.

Existing records created while payload capture was disabled will not retroactively contain request bodies.

## JSON inspection

The dashboard request view renders captured request bodies as a clickable JSON tree.

You can click fields such as:

```text
requestBody.messages[0].content[0].text
requestBody.system
requestBody.tools
summary.pruning
```

A modal opens with:

- the selected path;
- the selected value;
- real line breaks;
- copy button.

There is also a persistent browser checkbox to show full strings in the tree instead of truncating long values.

## Request pruning and optimization

The extension can remove unnecessary data before sending requests upstream.

Pruning modes:

```json
{
  "opencodegosniffer.requestPruningMode": "off"
}
```

Available modes:

| Mode | Behavior |
|------|----------|
| `off` | Do not inspect or modify the request for pruning. |
| `preview` | Estimate what would be saved, but send the original request. |
| `enabled` | Apply pruning and send the reduced request. |

### Remove complete nodes

```json
{
  "opencodegosniffer.requestPruningRemovePaths": [
    "system",
    "tools",
    "messages[].tool_calls"
  ]
}
```

Path syntax supports array wildcards with `[]`.

### Regex rules for string fields

```json
{
  "opencodegosniffer.requestPruningRegexRules": [
    {
      "path": "messages[].content[].text",
      "pattern": "<environment_info>[\\s\\S]*?<\\/environment_info>",
      "flags": "g",
      "replacement": ""
    },
    {
      "path": "messages[].content[].text",
      "pattern": "<workspace_info>[\\s\\S]*?<\\/workspace_info>",
      "flags": "g",
      "replacement": ""
    }
  ]
}
```

The dashboard shows:

- original estimated tokens;
- pruned estimated tokens;
- sent estimated tokens;
- saved estimated tokens;
- saved percentage;
- original bytes;
- pruned bytes;
- saved bytes;
- removed paths;
- modified strings.

> [!TIP]
> Start with `preview` mode. Once the saved content looks safe, switch to `enabled`.

## OpenCode usage integration

The dashboard includes a dedicated **Usage** tab for OpenCode workspace consumption.

This tab is separated from the Sniffer tab because it answers a different question:

- **Sniffer** shows what this extension is sending and receiving in real time.
- **Usage** shows OpenCode account/workspace consumption as reported by OpenCode itself.

The local Sniffer server performs these calls server-side to avoid browser CORS and cookie header limitations.

### Current usage / quota

OpenCode usage can be configured in two ways:

- from the **Usage** tab in the local dashboard;
- directly from VS Code without opening the dashboard.

To configure it from VS Code:

```text
Ctrl+Shift+P → OpenCode GO Sniffer: Configure OpenCode Usage Credentials
```

The command asks for:

1. OpenCode Usage URL;
2. OpenCode auth cookie;
3. optional `x-server-id` for detailed rows.

The Usage URL is stored in VS Code globalState. The auth cookie and optional `x-server-id` are stored in VS Code SecretStorage.

To clear these stored values:

```text
Ctrl+Shift+P → OpenCode GO Sniffer: Clear OpenCode Usage Credentials
```

This is useful when the dashboard cannot be opened easily, for example in restricted Remote SSH or intranet setups, but you still want the `OC 🔎` status bar to refresh quota data.

The **Load current usage** button reads the OpenCode `/go` page for the selected workspace.

This requires only:

- workspace usage URL;
- auth cookie.

Example usage URL:

```text
https://opencode.ai/workspace/wrk_XXXXXXXXXXXXXXXXXXXXXXXXXX/usage
```

The workspace ID is extracted automatically from the URL when possible.

The current usage view shows quota cards for:

- rolling 5-hour usage;
- weekly usage;
- monthly usage.

Each card shows:

- usage percentage;
- status;
- remaining time until reset.

The reset time is not guessed locally. It is read from OpenCode's own page data, using values such as `rollingUsage.resetInSec`, `weeklyUsage.resetInSec` and `monthlyUsage.resetInSec`.

That means the dashboard follows the same reset windows OpenCode reports, including the rolling 5-hour window.

### Usage detail / historical rows

The **Load usage detail** button reads the OpenCode internal `_server` usage endpoint.

This is used for detailed historical usage rows and requires:

- workspace usage URL;
- auth cookie;
- `x-server-id`.

The `x-server-id` is required only for detailed rows.

You can find it from the OpenCode usage page:

```text
https://opencode.ai/workspace/wrk_XXXXXXXXXXXXXXXXXXXXXXXXXX/usage
```

Steps:

1. Open the OpenCode usage page in your browser.
2. Open browser DevTools.
3. Go to the **Network** tab.
4. On the OpenCode usage page, click the control that loads the next usage page.
5. In DevTools, look for a request to:

```text
https://opencode.ai/_server
```

6. Select that request.
7. Open its **Request Headers** section.
8. Copy the value of:

```text
x-server-id
```

Paste that value into the dashboard field **x-server-id for detail**.

This value is only needed for **Load usage detail**. It is not needed for **Load current usage**, because current quota cards are loaded from the OpenCode `/go` page.

The dashboard starts from internal page `0` automatically and keeps loading detail pages until it reaches records older than the start of the current month, or until an internal safety limit is reached.

The user does not need to know or configure OpenCode internal page numbers.

The detail view shows:

- rows loaded;
- input tokens;
- output tokens;
- reasoning tokens;
- cache read tokens;
- input + cache tokens;
- estimated cost;
- usage table by model, provider, date and session.

It also renders simple local charts for:

- daily cost;
- daily token usage.

### Usage fields

| Field | Required for current usage | Required for usage detail | Notes |
|------|-----------------------------|----------------------------|-------|
| Usage URL | Yes | Yes | Example: `https://opencode.ai/workspace/wrk_.../usage` |
| Auth cookie | Yes | Yes | Accepts either `auth=...; oc_locale=es` or the raw auth value |
| x-server-id | No | Yes | Required only for `_server` usage detail |

### Privacy and storage

> [!WARNING]
> Your OpenCode auth cookie is sensitive. When configured in the dashboard, it is stored in browser `localStorage` for the web UI and also persisted to VS Code SecretStorage after usage is loaded. When configured from VS Code, it is stored directly in VS Code SecretStorage. Treat it as a secret. Clear it after debugging and rotate your session if it was exposed.

The OpenCode usage integration is optional. It is intended for debugging, monitoring and understanding consumption while working with OpenCode GO models through Copilot Chat.

## OpenCode usage status bar

The extension can show an additional compact OpenCode usage status item in the VS Code status bar:

```text
OC 🔎 3% / 6% / 20%
```

The three values represent:

```text
Rolling 5h / Weekly / Monthly
```

The tooltip shows:

```text
OpenCode Usage
Rolling 5h: 3%
Weekly: 6%
Monthly: 20%
Click to open Usage tab
```

Clicking it opens the dashboard directly on the **Usage** tab. In Remote SSH sessions it uses VS Code port forwarding by default when available, and falls back to the configured dashboard URL if needed.

The status refreshes automatically while VS Code is running.

It also refreshes when opening the Usage dashboard or manually with:

```text
Ctrl+Shift+P → OpenCode GO Sniffer: Refresh OpenCode Usage Status
```

The first time it may show `-- / -- / --` until usage credentials have been configured either from VS Code or from the Usage tab.

## Advanced token indicator

The extension reports usage to Copilot's native token indicator and can also show an additional status bar counter.

Disable the additional indicator with:

```json
{
  "opencodegosniffer.enableThirdPartyTokenIndicator": false
}
```

The status bar can show:

- current context usage;
- cumulative input tokens;
- cumulative output tokens;
- cache hit tokens when available;
- cache hit rate when available.

## Git commit message generation

Use the magic wand button in the Source Control panel to generate a commit message.

Configurable options:

```json
{
  "opencodegosniffer.commitLanguage": "auto",
  "opencodegosniffer.commitModel": "deepseek-v4-flash",
  "opencodegosniffer.commitMessagePrompt": "",
  "opencodegosniffer.recentCommitsCount": 10,
  "opencodegosniffer.commitIncludeCommitDiff": false,
  "opencodegosniffer.commitAttachContextFiles": true
}
```

The extension can:

- detect commit language from recent history;
- use recent commits as style reference;
- optionally include diffs from recent commits;
- optionally attach `AGENTS.md` and `README.md` as context.

## Temperature presets

Open the preset picker:

```text
OpenCode GO Sniffer: Set Model Temperature Preset
```

Built-in presets:

| Preset | Temperature |
|--------|-------------|
| Precise | 0.0 |
| Balanced | 1.0 |
| Creative | 1.2 |
| Extra Creative | 1.7 |

Manual configuration:

```json
{
  "opencodegosniffer.modelPreset": "custom",
  "opencodegosniffer.temperature": 0.7,
  "opencodegosniffer.top_p": 0.95
}
```

## Vision proxy

Text-only models can use a vision-capable model to describe images through the `describe_image` tool.

Settings:

```json
{
  "opencodegosniffer.visionProxyModel": "qwen3.6-plus",
  "opencodegosniffer.visionProxyPrompt": "",
  "opencodegosniffer.visionProxyThinking": false
}
```

This lets a text-only model receive an image description and answer based on it.

> [!NOTE]
> Vision proxy behavior is experimental and depends on the selected upstream models.

## OpenCode Zen free models

Zen free models are disabled by default.

Enable them with:

```json
{
  "opencodegosniffer.enableZenFreeModels": true
}
```

After changing this setting, reload VS Code.

Zen models appear in the model picker with a `Zen/` prefix.

## Main settings

```json
{
  "opencodegosniffer.commitLanguage": "auto",
  "opencodegosniffer.commitModel": "deepseek-v4-flash",
  "opencodegosniffer.commitMessagePrompt": "",
  "opencodegosniffer.requestTimeout": 600000,
  "opencodegosniffer.recentCommitsCount": 10,
  "opencodegosniffer.commitIncludeCommitDiff": false,
  "opencodegosniffer.commitAttachContextFiles": true,

  "opencodegosniffer.enableThirdPartyTokenIndicator": true,
  "opencodegosniffer.enableZenFreeModels": false,

  "opencodegosniffer.modelPreset": "custom",
  "opencodegosniffer.temperature": null,
  "opencodegosniffer.top_p": null,

  "opencodegosniffer.visionProxyModel": "qwen3.6-plus",
  "opencodegosniffer.visionProxyPrompt": "",
  "opencodegosniffer.visionProxyThinking": false,

  "opencodegosniffer.localStatsEnabled": true,
  "opencodegosniffer.localStatsPort": 43177,
  "opencodegosniffer.localStatsPortAutoIncrementMax": 20,
  "opencodegosniffer.localStatsHost": "127.0.0.1",
  "opencodegosniffer.localStatsUsePortForwarding": true,
  "opencodegosniffer.localStatsAllowedClients": "127.0.0.1,::1",
  "opencodegosniffer.localStatsCapturePayloads": false,
  "opencodegosniffer.localStatsMaxEntries": 200,

  "opencodegosniffer.requestPruningMode": "off",
  "opencodegosniffer.requestPruningRemovePaths": [],
  "opencodegosniffer.requestPruningRegexRules": []
}
```

## Security notes

This extension can inspect and optionally store sensitive data locally.

Be careful with:

- API keys;
- auth cookies;
- prompts;
- source code;
- diffs;
- tool outputs;
- workspace context;
- model responses;
- intranet dashboard access.

Recommendations:

- keep payload capture disabled unless debugging;
- use `127.0.0.1` unless you need intranet access;
- keep VS Code port forwarding enabled for Remote SSH unless you specifically need direct LAN access;
- use a restrictive IP allowlist;
- regenerate the dashboard token if shared accidentally;
- clear OpenCode usage credentials after testing and rotate the OpenCode session if the cookie was exposed;
- use pruning preview mode before enabling pruning.

## Build

```bash
npm install
npm run compile
npm run build
```

The build creates:

```text
extension.vsix
```

## Install local VSIX

```bash
code --install-extension extension.vsix --force
```

When using Remote SSH, make sure the extension is installed on the remote side if that is where Copilot/provider code is running.

## Development notes

The extension ID and internal settings namespace may still use `opencodegosniffer` for compatibility with previous builds.

A future major version may migrate the namespace to a new one.

## License

MIT License.

This project references and evolves ideas from OpenCode-compatible Copilot provider work, including `oai-compatible-copilot`.
