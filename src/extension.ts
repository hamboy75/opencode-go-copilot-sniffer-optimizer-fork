import * as vscode from "vscode";
import { OpenCodeGoChatModelProvider } from "./provider";
import { initStatusBar } from "./statusBar";
import { logger } from "./logger";
import { l10n, l10nFormat } from "./localize";
import type { ModelPreset } from "./types";
import { abortCommitGeneration, generateCommitMsg } from "./gitCommit/commitMessageGenerator";
import { TokenizerManager } from "./tokenizer/tokenizerManager";
import { LocalStatsServer } from "./localStats/server";

// ---- Walkthrough / Welcome constants ----

/** memento key tracking whether the welcome walkthrough has been shown. */
const WELCOME_SHOWN_KEY = "opencodegosniffer.welcomeShown";

/** Walkthrough contribution ID (publisher.extension#walkthroughId). */
const WALKTHROUGH_ID = "Hamboy75.opencode-go-copilot-sniffer-optimizer#opencodeGoGettingStarted";

const OPENCODE_USAGE_STATUS_INTERVAL_MS = 60 * 1000;
const OPENCODE_USAGE_STATUS_INITIAL_DELAY_MS = 5000;

export function activate(context: vscode.ExtensionContext) {
   // Initialize logger
   logger.init();

   // Initialize TokenizerManager with extension path
   TokenizerManager.initialize(context.extensionPath);

   const tokenCountStatusBarItem: vscode.StatusBarItem = initStatusBar(context);
   const localStatsServer = new LocalStatsServer(context);
   localStatsServer.start().catch((error) => {
       logger.warn("localStats.start.failed", { error: String(error) });
       vscode.window.showWarningMessage(l10nFormat("OpenCode GO Sniffer server could not start: {0}", String(error)));
   });

   const openCodeUsageStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
   openCodeUsageStatusBarItem.name = "OpenCode GO Usage";
   openCodeUsageStatusBarItem.command = "opencodegosniffer.openUsageStats";
   openCodeUsageStatusBarItem.text = "OC $(search) -- / -- / --";
   openCodeUsageStatusBarItem.tooltip = "OpenCode Usage\nRolling 5h: not loaded\nWeekly: not loaded\nMonthly: not loaded\nClick to open Usage tab";
   openCodeUsageStatusBarItem.show();

   const refreshOpenCodeUsageStatus = () => {
       void updateOpenCodeUsageStatusBar(localStatsServer, openCodeUsageStatusBarItem);
   };

   const openCodeUsageStatusInitialTimer = setTimeout(refreshOpenCodeUsageStatus, OPENCODE_USAGE_STATUS_INITIAL_DELAY_MS);
   const openCodeUsageStatusTimer = setInterval(refreshOpenCodeUsageStatus, OPENCODE_USAGE_STATUS_INTERVAL_MS);

   context.subscriptions.push(openCodeUsageStatusBarItem, {
       dispose: () => {
           clearTimeout(openCodeUsageStatusInitialTimer);
           clearInterval(openCodeUsageStatusTimer);
       },
   });

   const provider = new OpenCodeGoChatModelProvider(context.secrets, tokenCountStatusBarItem);

   // Register the OpenCode GO Sniffer provider under the vendor id used in package.json
   vscode.lm.registerLanguageModelChatProvider("opencodegosniffer", provider);

   // Helper: check if an API key is stored (without prompting)
   const hasApiKey = async (): Promise<boolean> => {
       const key = await context.secrets.get("opencodegosniffer.apiKey");
       return !!key;
   };

   // Management command to configure API key
   context.subscriptions.push(
       vscode.commands.registerCommand("opencodegosniffer.setApiKey", async () => {
           const existing = await context.secrets.get("opencodegosniffer.apiKey");
           const apiKey = await vscode.window.showInputBox({
               title: l10n("OpenCode GO Sniffer API Key"),
               prompt: existing ? l10n("Update your OpenCode GO API key") : l10n("Enter your OpenCode GO API key"),
               ignoreFocusOut: true,
               password: true,
               value: existing ?? "",
           });
           if (apiKey === undefined) {
               return; // user canceled
           }
           if (!apiKey.trim()) {
               await context.secrets.delete("opencodegosniffer.apiKey");
               vscode.window.showInformationMessage(l10n("OpenCode GO API key cleared."));
               return;
           }
           await context.secrets.store("opencodegosniffer.apiKey", apiKey.trim());
           vscode.window.showInformationMessage(l10n("OpenCode GO API key saved."));
       })
   );

   // Command to open the OpenCode GO website to get an API key
   context.subscriptions.push(
       vscode.commands.registerCommand("opencodegosniffer.getApiKey", () => {
           vscode.env.openExternal(vscode.Uri.parse("https://opencode.ai/auth"));
       })
   );

   // Command to open extension settings
   context.subscriptions.push(
       vscode.commands.registerCommand("opencodegosniffer.openSettings", () => {
           vscode.commands.executeCommand("workbench.action.openSettings", "@ext:Hamboy75.opencode-go-copilot-sniffer-optimizer");
       })
   );



    const openDashboardUrl = async (page?: "sniffer" | "usage"): Promise<void> => {
        await localStatsServer.start();

        const config = vscode.workspace.getConfiguration();
        const usePortForwarding = config.get<boolean>("opencodegosniffer.localStatsUsePortForwarding", true);

        if (usePortForwarding) {
            const localUrl = localStatsServer.getDashboardUrl(page);
            if (!localUrl) {
                vscode.window.showWarningMessage(l10n("OpenCode GO Sniffer server is disabled."));
                return;
            }

            try {
                const externalUri = await vscode.env.asExternalUri(vscode.Uri.parse(localUrl));
                await vscode.env.openExternal(externalUri);
                return;
            } catch (error) {
                logger.warn("localStats.portForwarding.failed", { error: String(error) });
                vscode.window.showWarningMessage(l10n("Could not open the dashboard through VS Code port forwarding. Falling back to the configured dashboard URL."));
            }
        }

        const url = localStatsServer.getPreferredDashboardUrl(page);
        if (!url) {
            vscode.window.showWarningMessage(l10n("OpenCode GO Sniffer server is disabled."));
            return;
        }

        await vscode.env.openExternal(vscode.Uri.parse(url));
    };

    // Local statistics dashboard commands
    context.subscriptions.push(
        vscode.commands.registerCommand("opencodegosniffer.refreshOpenCodeUsageStatus", async () => {
           openCodeUsageStatusBarItem.text = "OC $(sync~spin) ...";
           openCodeUsageStatusBarItem.tooltip = l10n("Refreshing OpenCode usage...");

           await updateOpenCodeUsageStatusBar(localStatsServer, openCodeUsageStatusBarItem);

           vscode.window.showInformationMessage(l10n("OpenCode usage status refreshed."));
       }),
       vscode.commands.registerCommand("opencodegosniffer.configureOpenCodeUsage", async () => {
           const existing = await localStatsServer.getStoredOpencodeUsageConfig();

           const usageUrl = await vscode.window.showInputBox({
               title: l10n("OpenCode Usage URL"),
               prompt: l10n("Paste your OpenCode workspace usage URL, for example https://opencode.ai/workspace/wrk_.../usage"),
               value: existing.usageUrl ?? "",
               ignoreFocusOut: true,
               validateInput: (value) => {
                   const trimmed = value.trim();
                   if (!trimmed) return l10n("Usage URL is required.");
                   if (!/\bwrk_[A-Za-z0-9]+\b/.test(trimmed)) return l10n("Usage URL must contain a workspace id like wrk_...");
                   return null;
               },
           });
           if (usageUrl === undefined) return;

           const authCookie = await vscode.window.showInputBox({
               title: l10n("OpenCode Auth Cookie"),
               prompt: l10n("Paste your OpenCode auth cookie. You can paste either auth=... or the raw auth value."),
               value: existing.authCookie ?? "",
               ignoreFocusOut: true,
               password: true,
               validateInput: (value) => {
                   if (!value.trim()) return l10n("Auth cookie is required.");
                   return null;
               },
           });
           if (authCookie === undefined) return;

           const serverId = await vscode.window.showInputBox({
               title: l10n("OpenCode x-server-id"),
               prompt: l10n("Optional. Required only for detailed usage rows. Copy it from DevTools Network request headers on the OpenCode usage page."),
               value: existing.serverId ?? "",
               ignoreFocusOut: true,
               password: true,
           });
           if (serverId === undefined) return;

           await localStatsServer.setStoredOpencodeUsageConfig({
               usageUrl: usageUrl.trim(),
               authCookie: authCookie.trim(),
               serverId: serverId.trim(),
           });

           vscode.window.showInformationMessage(l10n("OpenCode usage credentials saved."));
           refreshOpenCodeUsageStatus();
       }),
       vscode.commands.registerCommand("opencodegosniffer.clearOpenCodeUsage", async () => {
           const confirm = await vscode.window.showWarningMessage(
               l10n("Clear stored OpenCode usage URL, auth cookie and x-server-id?"),
               { modal: true },
               l10n("Clear")
           );

           if (confirm !== l10n("Clear")) {
               return;
           }

           await localStatsServer.clearStoredOpencodeUsageConfig();
           vscode.window.showInformationMessage(l10n("OpenCode usage credentials cleared."));
           refreshOpenCodeUsageStatus();
       }),
       vscode.commands.registerCommand("opencodegosniffer.openUsageStats", async () => {
            openCodeUsageStatusBarItem.text = "OC $(sync~spin) ...";
            await updateOpenCodeUsageStatusBar(localStatsServer, openCodeUsageStatusBarItem);

            await openDashboardUrl("usage");
        }),
        vscode.commands.registerCommand("opencodegosniffer.openLocalStats", async () => {
            await openDashboardUrl();
        }),
       vscode.commands.registerCommand("opencodegosniffer.restartLocalStats", async () => {
           await localStatsServer.stop();
           await localStatsServer.start();
           const url = localStatsServer.getDashboardUrl();
           vscode.window.showInformationMessage(url ? l10nFormat("OpenCode GO Sniffer server running at {0}", url) : l10n("OpenCode GO Sniffer server is disabled."));
       }),
       vscode.commands.registerCommand("opencodegosniffer.copyLocalStatsUrl", async () => {
           await localStatsServer.start();
           const url = localStatsServer.getDashboardUrl();
           if (!url) {
               vscode.window.showWarningMessage(l10n("OpenCode GO Sniffer server is disabled."));
               return;
           }
           await vscode.env.clipboard.writeText(url);
           vscode.window.showInformationMessage(l10n("OpenCode GO Sniffer local URL copied to clipboard."));
       }),
       vscode.commands.registerCommand("opencodegosniffer.copyIntranetStatsUrl", async () => {
           await localStatsServer.start();
           const url = localStatsServer.getIntranetDashboardUrl();
           if (!url) {
               vscode.window.showWarningMessage(l10n("Could not determine an intranet IP address for this machine."));
               return;
           }
           await vscode.env.clipboard.writeText(url);
           vscode.window.showInformationMessage(l10nFormat("OpenCode GO Sniffer intranet URL copied to clipboard: {0}", url));
       }),
       vscode.commands.registerCommand("opencodegosniffer.regenerateLocalStatsToken", async () => {
           await context.secrets.delete("opencodegosniffer.localStatsToken");
           await localStatsServer.stop();
           await localStatsServer.start();

           const localUrl = localStatsServer.getDashboardUrl();
           const intranetUrl = localStatsServer.getIntranetDashboardUrl();

           const message = intranetUrl
               ? l10nFormat("OpenCode GO Sniffer token regenerated. Local: {0} Intranet: {1}", localUrl ?? "", intranetUrl)
               : l10nFormat("OpenCode GO Sniffer token regenerated. Local: {0}", localUrl ?? "");

           if (localUrl) {
               await vscode.env.clipboard.writeText(localUrl);
           }

           vscode.window.showInformationMessage(message);
       })        
   );

   // Register the generateGitCommitMessage command handler
   context.subscriptions.push(
       vscode.commands.registerCommand("opencodegosniffer.generateGitCommitMessage", async (scm) => {
           generateCommitMsg(context.secrets, scm);
       }),
       vscode.commands.registerCommand("opencodegosniffer.abortGitCommitMessage", () => {
           abortCommitGeneration();
       })
   );

   // Register the setModelPreset command: user can select a preset via QuickPick
   context.subscriptions.push(
       vscode.commands.registerCommand("opencodegosniffer.setModelPreset", async () => {
           const config = vscode.workspace.getConfiguration();
           const presets = config.get<ModelPreset[]>("opencodegosniffer.modelPresets", []);
           const currentPresetId = config.get<string>("opencodegosniffer.modelPreset", "custom");
           const currentTemp = config.get<number | null>("opencodegosniffer.temperature", null);
           const currentTopP = config.get<number | null>("opencodegosniffer.top_p", null);

           interface PresetQuickPickItem extends vscode.QuickPickItem {
               presetId?: string;
           }

           // Mark the currently active preset with " (当前)"
           const presetItems: PresetQuickPickItem[] = presets.map((p) => ({
               label: `${l10n(p.label)} (${p.temperature})${p.id === currentPresetId ? l10n(" (current)") : ""}`,
               presetId: p.id,
           }));

           // Mark custom option with current values if active
           const isCustomActive = currentPresetId === "custom";
           const customLabel = "$(pencil) " + l10n("Custom (manual input)")
               + (isCustomActive
                   ? ` ${l10nFormat("(current, temperature: {0}, top_p: {1})", String(currentTemp ?? "—"), String(currentTopP ?? "—"))}`
                   : "");

           const customItem: PresetQuickPickItem = {
               label: customLabel,
           };

           const items: PresetQuickPickItem[] = [
               ...presetItems,
               { label: "", kind: vscode.QuickPickItemKind.Separator },
               customItem,
           ];

           const title = l10n("Set Model Preset");

           const picked = await vscode.window.showQuickPick(items, {
               title,
               placeHolder: l10n("Select a preset"),
               ignoreFocusOut: true,
           });

           if (!picked) {
               return;
           }

           const presetId = picked.presetId;

           if (presetId) {
               // User selected a named preset
               const matchedPreset = presets.find((p) => p.id === presetId);
               if (matchedPreset) {
                   await config.update("opencodegosniffer.modelPreset", matchedPreset.id, vscode.ConfigurationTarget.Global);
                   await config.update("opencodegosniffer.temperature", matchedPreset.temperature, vscode.ConfigurationTarget.Global);
                   vscode.window.showInformationMessage(
                       l10nFormat("Set to temperature: {0} ({1})", String(matchedPreset.temperature), l10n(matchedPreset.label))
                   );
               }
           } else {
               // User chose "Custom (manual input)"
               const currentVal = currentTemp !== null && currentTopP !== null
                   ? `${currentTemp},${currentTopP}`
                   : "";
               const inputValue = await vscode.window.showInputBox({
                   title: l10n("Enter custom temperature"),
                   prompt: l10n("Enter a single number for temperature only (<=2), or two comma-separated numbers for temperature and top_p (temp<=2, top_p<=1), e.g.: 0.7 or 0.7,0.95"),
                   value: currentVal,
                   validateInput: (val: string) => {
                       const trimmed = val.trim();
                       if (!trimmed) {
                           return l10n("Please enter at least temperature value");
                       }
                       const parts = trimmed.split(",");
                       if (parts.length > 2) {
                           return l10n("Please enter at most two numbers separated by a comma");
                       }
                       const temp = parseFloat(parts[0].trim());
                       if (isNaN(temp) || temp < 0 || temp > 2) {
                           return l10n("Temperature must be between 0.0 and 2.0");
                       }
                       if (parts.length === 2) {
                           const topP = parseFloat(parts[1].trim());
                           if (isNaN(topP) || topP < 0 || topP > 1) {
                               return l10n("top_p must be between 0.0 and 1.0");
                           }
                       }
                       return null;
                   },
                   ignoreFocusOut: true,
               });
               if (inputValue !== undefined) {
                   const trimmed = inputValue.trim();
                   const parts = trimmed.split(",");
                   const tempNum = parseFloat(parts[0].trim());
                   await config.update("opencodegosniffer.modelPreset", "custom", vscode.ConfigurationTarget.Global);
                   await config.update("opencodegosniffer.temperature", tempNum, vscode.ConfigurationTarget.Global);
                   if (parts.length === 2) {
                       const topPNum = parseFloat(parts[1].trim());
                       await config.update("opencodegosniffer.top_p", topPNum, vscode.ConfigurationTarget.Global);
                       vscode.window.showInformationMessage(
                           l10nFormat("Set to temp: {0}, top_p: {1} (custom)", String(tempNum), String(topPNum))
                       );
                   } else {
                       vscode.window.showInformationMessage(
                           l10nFormat("Set to temperature: {0} (custom)", String(tempNum))
                       );
                   }
               }
           }
       })
   );

   // Show welcome walkthrough on first install (when no API key is configured)
   showWelcomeIfNeeded(context);

   // Dispose local server and logger on deactivate
   context.subscriptions.push({
       dispose: () => {
           void localStatsServer.stop();
           logger.dispose();
       },
   });
}

/**
* Show the welcome walkthrough on first activation if no API key is configured.
* Once shown (or if a key already exists) the flag is persisted so it won't
* reappear after subsequent reloads.
*/
async function showWelcomeIfNeeded(context: vscode.ExtensionContext): Promise<void> {
   try {
       if (context.globalState.get<boolean>(WELCOME_SHOWN_KEY)) {
           return;
       }
       const apiKey = await context.secrets.get("opencodegosniffer.apiKey");
       if (apiKey) {
           // API key already set — no need to show welcome
           await context.globalState.update(WELCOME_SHOWN_KEY, true);
           return;
       }
       await vscode.commands.executeCommand("workbench.action.openWalkthrough", WALKTHROUGH_ID, false);
       await context.globalState.update(WELCOME_SHOWN_KEY, true);
   } catch (error) {
       logger.warn("Failed to show welcome walkthrough", { error: String(error) });
   }
}

async function updateOpenCodeUsageStatusBar(
   localStatsServer: LocalStatsServer,
   item: vscode.StatusBarItem
): Promise<void> {
   try {
       const quota = await localStatsServer.getStoredOpencodeQuota();
       if (!quota) {
           item.text = "OC $(search) -- / -- / --";
           item.tooltip = "OpenCode Usage\nRolling 5h: not configured\nWeekly: not configured\nMonthly: not configured\nClick to open Usage tab";
           return;
       }

       const rolling = quota.rolling?.usagePercent ?? 0;
       const weekly = quota.weekly?.usagePercent ?? 0;
       const monthly = quota.monthly?.usagePercent ?? 0;

       item.text = `OC $(search) ${formatUsagePercent(rolling)} / ${formatUsagePercent(weekly)} / ${formatUsagePercent(monthly)}`;
       item.tooltip = [
           "OpenCode Usage",
           `Rolling 5h: ${formatUsagePercent(rolling)} (${formatResetTime(quota.rolling?.resetsInSeconds)})`,
           `Weekly: ${formatUsagePercent(weekly)} (${formatResetTime(quota.weekly?.resetsInSeconds)})`,
           `Monthly: ${formatUsagePercent(monthly)} (${formatResetTime(quota.monthly?.resetsInSeconds)})`,
           "Click to open Usage tab",
       ].join("\n");
   } catch (error) {
       item.text = "OC $(search) error";
       item.tooltip = `OpenCode Usage\nCould not refresh usage: ${error instanceof Error ? error.message : String(error)}\nClick to open Usage tab`;
   }
}

function formatUsagePercent(value: unknown): string {
   const numeric = Number(value ?? 0);
   return `${Math.max(0, Math.min(100, Math.round(Number.isFinite(numeric) ? numeric : 0)))}%`;
}

function formatResetTime(seconds: unknown): string {
   const total = Math.max(0, Number(seconds ?? 0));
   const days = Math.floor(total / 86400);
   const hours = Math.floor((total % 86400) / 3600);
   const minutes = Math.floor((total % 3600) / 60);
   if (days > 0) return `resets in ${days}d ${hours}h`;
   if (hours > 0) return `resets in ${hours}h ${minutes}m`;
   return `resets in ${minutes}m`;
}

export function deactivate() { }
