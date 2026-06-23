
---

## 4. `CHANGELOG.md`

```markdown
# Changelog

## 1.0.2

### Added

- Added VS Code command to configure OpenCode usage credentials without opening the local dashboard.
- Added VS Code command to clear stored OpenCode usage credentials.
- Added VS Code command to manually refresh the OpenCode usage status bar.
- OpenCode usage status now refreshes automatically every minute and when opening the Usage dashboard.
- Usage URL, auth cookie and optional `x-server-id` can now be entered directly from the Command Palette.
- The `OC` usage status bar can refresh from credentials configured directly in VS Code.

### Security

- OpenCode auth cookie and `x-server-id` are stored in VS Code SecretStorage when configured from VS Code.
- OpenCode Usage URL is stored in VS Code globalState.

## 1.0.1

### Fixed

- Prefer the intranet dashboard URL when opening the Sniffer or Usage dashboard from VS Code commands.
- Fixed Remote SSH usage where clicking the `OC` usage status bar opened `127.0.0.1` instead of the remote host LAN address.
- Added a shared preferred dashboard URL resolver that falls back to the local URL only when no intranet address can be detected.

### Notes

- This mainly affects remote VS Code sessions where the dashboard server runs on the remote machine.
- `Copy Local Sniffer URL` still copies the explicit local URL.
- `Copy Intranet Sniffer URL` still copies the explicit intranet URL.

## 1.0.0

Initial release of **OpenCode GO Copilot Sniffer & Optimizer**.

### Added

- OpenCode GO provider support for GitHub Copilot Chat.
- Optional OpenCode Zen free model support.
- Native Copilot token usage reporting.
- Advanced status bar token counter.
- Git commit message generation.
- Commit language detection from recent commit history.
- Commit style reference from recent commits.
- Optional commit context from `AGENTS.md` and `README.md`.
- Model temperature presets.
- Manual `temperature` and `top_p` configuration.
- Configurable request timeout for long streaming responses.
- Vision proxy support for text-only models through `describe_image`.
- Optional reasoning/thinking support for vision proxy calls.
- Local Sniffer dashboard.
- Token-protected local dashboard URLs.
- Local dashboard server restart command.
- Local and intranet dashboard URL copy commands.
- Dashboard token regeneration command.
- Dynamic dashboard port selection from a base port.
- Intranet dashboard binding via configurable host.
- IP allowlist with exact IPs, IPv4 wildcards, CIDR, netmask syntax, `*` and `any`.
- Request summary cards in the dashboard.
- Request list with status, model, URL and duration.
- Request detail panel.
- Optional full request body capture.
- Optional full response text capture.
- Response preview display.
- Clickable JSON tree for captured request bodies.
- Field modal with real line breaks and copy button.
- Persistent dashboard view preferences in browser `localStorage`.
- Persistent selected detail tab behavior.
- Full-string toggle for large JSON values.
- Request pruning system.
- Pruning modes: `off`, `preview`, `enabled`.
- Remove-path pruning for complete JSON nodes.
- Regex-based pruning for string fields.
- Pruning token and byte savings metrics.
- Pruning summary cards in the dashboard.
- OpenCode workspace usage panel.
- Usage URL parsing for automatic workspace ID detection.
- Auth cookie input for OpenCode usage fetching.
- Optional `x-server-id` / server hash input.
- Multi-page OpenCode usage loading.
- Usage totals for input, output, reasoning, cache and cost.
- Usage table by date, model, provider, tokens, cost, session and page.
- Spanish manifest localization.
- Chinese manifest localization refresh.
- New branding as OpenCode GO Copilot Sniffer & Optimizer.

### Security

- Dashboard requires a per-installation random token stored in VS Code SecretStorage.
- Payload capture is disabled by default.
- Intranet access requires explicit host and allowlist configuration.
- OpenCode usage cookie is stored only in browser `localStorage` when entered in the dashboard.

### Notes

- The internal command and setting namespace remains `opencodegosniffer.*` for compatibility.
- A future breaking version may migrate the namespace.