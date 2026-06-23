import * as http from "node:http";
import * as crypto from "node:crypto";
import * as os from "node:os";
import * as vscode from "vscode";
import { localStatsRecorder } from "./recorder";

const LOCAL_STATS_TOKEN_KEY = "opencodegosniffer.localStatsToken";
const OPENCODE_USAGE_URL_KEY = "opencodegosniffer.openCodeUsage.usageUrl";
const OPENCODE_USAGE_AUTH_COOKIE_KEY = "opencodegosniffer.openCodeUsage.authCookie";
const OPENCODE_USAGE_SERVER_ID_KEY = "opencodegosniffer.openCodeUsage.serverId";
const OPENCODE_USAGE_DETAIL_DEFAULT_START_PAGE = 0;
const OPENCODE_USAGE_DETAIL_MAX_AUTO_PAGES = 100;

export interface OpencodeQuotaWindow {
   status: "ok" | "error" | "unknown";
   usagePercent: number;
   resetsInSeconds: number;
}

export interface OpencodeQuotaSnapshot {
   rolling: OpencodeQuotaWindow;
   weekly: OpencodeQuotaWindow;
    monthly: OpencodeQuotaWindow;
}

export interface StoredOpencodeUsageConfig {
    usageUrl?: string;
    authCookie?: string;
    serverId?: string;
}

export class LocalStatsServer {
   private server?: http.Server;
   private port?: number;
   private host?: string;
   private token?: string;

   constructor(private readonly context: vscode.ExtensionContext) {}

   async start(): Promise<void> {
       const config = vscode.workspace.getConfiguration();
       const enabled = config.get<boolean>("opencodegosniffer.localStatsEnabled", true);
       const capturePayloads = config.get<boolean>("opencodegosniffer.localStatsCapturePayloads", false);
       const maxEntries = config.get<number>("opencodegosniffer.localStatsMaxEntries", 200);
       localStatsRecorder.configure({ enabled, capturePayloads, maxEntries });

       if (!enabled) {
           await this.stop();
           return;
       }

       const desiredPort = config.get<number>("opencodegosniffer.localStatsPort", 43177);
       const desiredHost = normalizeBindHost(config.get<string>("opencodegosniffer.localStatsHost", "127.0.0.1"));
       const maxPortAttempts = config.get<number>("opencodegosniffer.localStatsPortAutoIncrementMax", 20);

       this.token = await this.getOrCreateToken();

       // If a server is already running on the same host in the allowed dynamic range,
       // keep it. This makes Copy URL actions stable and avoids restarting unnecessarily.
       if (
           this.server &&
           this.host === desiredHost &&
           this.port !== undefined &&
           this.port >= desiredPort &&
           this.port <= desiredPort + Math.max(0, maxPortAttempts)
       ) {
           return;
       }

       await this.stop();

       const attempts = Math.max(0, Math.min(maxPortAttempts, 500));
       let lastError: unknown;

       for (let offset = 0; offset <= attempts; offset++) {
           const candidatePort = desiredPort + offset;

           try {
               const server = await this.listen(candidatePort, desiredHost);
               this.server = server;
               this.port = candidatePort;
               this.host = desiredHost;
               return;
           } catch (error) {
               lastError = error;

               if (!isPortUnavailableError(error)) {
                   throw error;
               }
           }
       }

       throw lastError instanceof Error
           ? lastError
           : new Error(`Could not start OpenCode GO Sniffer server from port ${desiredPort} to ${desiredPort + attempts}`);
   }

   async stop(): Promise<void> {
       if (!this.server) return;
       const server = this.server;
       this.server = undefined;
       this.port = undefined;
       this.host = undefined;
       await new Promise<void>((resolve) => server.close(() => resolve()));
   }

   getBaseUrl(): string | undefined {
       if (!this.port) return undefined;
       const displayHost = !this.host || this.host === "0.0.0.0" || this.host === "::" ? "127.0.0.1" : this.host;
       return `http://${hostForUrl(displayHost)}:${this.port}`;
   }

   getDashboardUrl(page?: "sniffer" | "usage"): string | undefined {
       const base = this.getBaseUrl();
       if (!base || !this.token) return undefined;
       return this.buildDashboardUrl(base, page);
   }

   getIntranetDashboardUrl(page?: "sniffer" | "usage"): string | undefined {
       if (!this.port || !this.token) return undefined;
       const intranetHost = this.getIntranetHost();
       if (!intranetHost) return undefined;
       return this.buildDashboardUrl(`http://${hostForUrl(intranetHost)}:${this.port}`, page);
   }

   getPreferredDashboardUrl(page?: "sniffer" | "usage"): string | undefined {
        return this.getIntranetDashboardUrl(page) ?? this.getDashboardUrl(page);
    }

    async getStoredOpencodeUsageConfig(): Promise<StoredOpencodeUsageConfig> {
        return {
            usageUrl: this.context.globalState.get<string>(OPENCODE_USAGE_URL_KEY),
            authCookie: await this.context.secrets.get(OPENCODE_USAGE_AUTH_COOKIE_KEY),
            serverId: await this.context.secrets.get(OPENCODE_USAGE_SERVER_ID_KEY),
        };
    }

    async setStoredOpencodeUsageConfig(input: StoredOpencodeUsageConfig): Promise<void> {
        const usageUrl = String(input.usageUrl ?? "").trim();
        const authCookie = String(input.authCookie ?? "").trim();
        const serverId = String(input.serverId ?? "").trim();

        await this.context.globalState.update(OPENCODE_USAGE_URL_KEY, usageUrl || undefined);

        if (authCookie) await this.context.secrets.store(OPENCODE_USAGE_AUTH_COOKIE_KEY, authCookie);
        else await this.context.secrets.delete(OPENCODE_USAGE_AUTH_COOKIE_KEY);

        if (serverId) await this.context.secrets.store(OPENCODE_USAGE_SERVER_ID_KEY, serverId);
        else await this.context.secrets.delete(OPENCODE_USAGE_SERVER_ID_KEY);
    }

    async clearStoredOpencodeUsageConfig(): Promise<void> {
        await this.context.globalState.update(OPENCODE_USAGE_URL_KEY, undefined);
        await this.context.secrets.delete(OPENCODE_USAGE_AUTH_COOKIE_KEY);
        await this.context.secrets.delete(OPENCODE_USAGE_SERVER_ID_KEY);
    }

    private buildDashboardUrl(base: string, page?: "sniffer" | "usage"): string {
        const hash = page ? `#${page}` : "";
        return `${base}/?token=${encodeURIComponent(this.token ?? "")}${hash}`;
   }

   async getStoredOpencodeQuota(): Promise<OpencodeQuotaSnapshot | undefined> {
       const usageUrl = this.context.globalState.get<string>(OPENCODE_USAGE_URL_KEY);
       const authCookie = await this.context.secrets.get(OPENCODE_USAGE_AUTH_COOKIE_KEY);
       const workspaceId = extractWorkspaceIdFromUsageUrl(usageUrl);

       if (!workspaceId || !authCookie) {
           return undefined;
       }

       return fetchOpencodeQuotaSnapshot(workspaceId, normalizeOpencodeCookie(authCookie));
   }

   private getIntranetHost(): string | undefined {
       if (this.host && this.host !== "0.0.0.0" && this.host !== "::" && this.host !== "127.0.0.1" && this.host !== "localhost" && this.host !== "::1") {
           return this.host;
       }
       return getFirstLanIpv4Address();
   }

   private async getOrCreateToken(): Promise<string> {
       const existing = await this.context.secrets.get(LOCAL_STATS_TOKEN_KEY);
       if (existing) return existing;
       const token = crypto.randomBytes(24).toString("hex");
       await this.context.secrets.store(LOCAL_STATS_TOKEN_KEY, token);
       return token;
   }

   private async listen(port: number, host: string): Promise<http.Server> {
       const server = http.createServer((req, res) => this.handle(req, res));

       try {
           await new Promise<void>((resolve, reject) => {
               const onError = (err: Error) => {
                   server.off("listening", onListening);
                   reject(err);
               };

               const onListening = () => {
                   server.off("error", onError);
                   resolve();
               };

               server.once("error", onError);
               server.once("listening", onListening);
               server.listen(port, host);
           });

           return server;
       } catch (error) {
           server.close();
           throw error;
       }
   }

   private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
       try {
           const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.port ?? 0}`);
           if (req.method === "GET" && url.pathname === "/favicon.ico") {
               res.statusCode = 204;
               res.end();
               return;
           }

           if (!this.isRemoteAddressAllowed(req)) {
               this.json(res, 403, { error: "Forbidden", remoteAddress: normalizeRemoteAddress(req.socket.remoteAddress) ?? "unknown" });
               return;
           }

           if (!this.isAuthorized(req)) {
               this.json(res, 401, { error: "Unauthorized" });
               return;
           }

           if (req.method === "GET" && url.pathname === "/") {
               this.html(res, dashboardHtml(this.token ?? ""));
               return;
           }
           if (req.method === "GET" && url.pathname === "/api/summary") {
               this.json(res, 200, localStatsRecorder.summary());
               return;
           }
           if (req.method === "GET" && url.pathname === "/api/requests") {
               const limit = Number(url.searchParams.get("limit") ?? "50");
               this.json(res, 200, localStatsRecorder.list(limit));
               return;
           }
           if (req.method === "GET" && url.pathname.startsWith("/api/requests/")) {
               const id = decodeURIComponent(url.pathname.slice("/api/requests/".length));
               const item = localStatsRecorder.get(id);
               if (!item) {
                   this.json(res, 404, { error: "Not found" });
                   return;
               }
               this.json(res, 200, item);
               return;
           }
           if (req.method === "POST" && url.pathname === "/api/opencode/quota") {
               void this.handleOpencodeQuota(req, res);
               return;
           }
           if (req.method === "POST" && url.pathname === "/api/opencode/usage-detail") {
               void this.handleOpencodeUsageDetail(req, res);
               return;
           }
           if (req.method === "POST" && url.pathname === "/api/opencode/usage") {
               void this.handleOpencodeUsage(req, res);
               return;
           }
           if (req.method === "POST" && url.pathname === "/api/clear") {
               localStatsRecorder.clear();
               this.json(res, 200, { ok: true });
               return;
           }
           this.json(res, 404, { error: "Not found" });
       } catch (err) {
           this.json(res, 500, { error: err instanceof Error ? err.message : String(err) });
       }
   }

   private isRemoteAddressAllowed(req: http.IncomingMessage): boolean {
       const config = vscode.workspace.getConfiguration();
       const rulesText = config.get<string>("opencodegosniffer.localStatsAllowedClients", "127.0.0.1,::1");
       const remoteAddress = normalizeRemoteAddress(req.socket.remoteAddress);
       if (!remoteAddress) return false;
       return isAddressAllowed(remoteAddress, rulesText);
   }

   private isAuthorized(req: http.IncomingMessage): boolean {
       const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.port ?? 0}`);
       const tokenFromQuery = url.searchParams.get("token");
       const auth = req.headers.authorization ?? "";
       const tokenFromHeader = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
       return !!this.token && (tokenFromQuery === this.token || tokenFromHeader === this.token);
   }

   private async handleOpencodeQuota(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
       try {
           const input = await readJsonBody<OpencodeUsageRequestInput>(req);
           await this.persistOpenCodeUsageConfig(input);
           const workspaceId = String(input.workspaceId ?? extractWorkspaceIdFromUsageUrl(input.usageUrl) ?? "").trim();
           const authCookie = String(input.authCookie ?? "").trim();
           if (!workspaceId) throw new Error("Usage URL must contain a workspace id like wrk_...");
           if (!authCookie) throw new Error("authCookie is required.");
           const quota = await fetchOpencodeQuotaSnapshot(workspaceId, normalizeOpencodeCookie(authCookie));
           this.json(res, 200, { ok: true, workspaceId, quota });
       } catch (err) {
           this.json(res, 500, { error: err instanceof Error ? err.message : String(err) });
       }
   }

   private async handleOpencodeUsageDetail(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
       try {
           const input = await readJsonBody<OpencodeUsageRequestInput>(req);
           await this.persistOpenCodeUsageConfig(input);
           const result = await fetchOpencodeUsageDetail(input);
           this.json(res, 200, result);
       } catch (err) {
           this.json(res, 500, {
               error: err instanceof Error ? err.message : String(err),
           });
       }
   }

   private async handleOpencodeUsage(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
       try {
           const input = await readJsonBody<OpencodeUsageRequestInput>(req);
           await this.persistOpenCodeUsageConfig(input);
           const result = await fetchOpencodeUsage(input);
           this.json(res, 200, result);
       } catch (err) {
           this.json(res, 500, {
               error: err instanceof Error ? err.message : String(err),
           });
       }
   }

    private async persistOpenCodeUsageConfig(input: OpencodeUsageRequestInput): Promise<void> {
        const usageUrl = String(input.usageUrl ?? "").trim();
        const authCookie = String(input.authCookie ?? "").trim();
        const serverId = String(input.serverId ?? "").trim();

        if (usageUrl) {
            await this.context.globalState.update(OPENCODE_USAGE_URL_KEY, usageUrl);
        }
        if (authCookie) {
            await this.context.secrets.store(OPENCODE_USAGE_AUTH_COOKIE_KEY, authCookie);
        }
        if (serverId) {
            await this.context.secrets.store(OPENCODE_USAGE_SERVER_ID_KEY, serverId);
        }
    }

   private json(res: http.ServerResponse, status: number, body: unknown): void {
       res.statusCode = status;
       res.setHeader("Content-Type", "application/json; charset=utf-8");
       res.setHeader("Cache-Control", "no-store");
       res.end(JSON.stringify(body, null, 2));
   }

   private html(res: http.ServerResponse, body: string): void {
       res.statusCode = 200;
       res.setHeader("Content-Type", "text/html; charset=utf-8");
       res.setHeader("Cache-Control", "no-store");
       res.end(body);
   }
}

function isPortUnavailableError(error: unknown): boolean {
   if (!(error instanceof Error)) {
       return false;
   }

   const code = (error as NodeJS.ErrnoException).code;
   return code === "EADDRINUSE" || code === "EACCES";
}

interface OpencodeUsageRequestInput {
   workspaceId?: string;
   usageUrl?: string;
   authCookie?: string;
   startPage?: number;
   maxPages?: number;
   serverId?: string;
}

interface OpencodeUsageRow {
   id: string;
   workspaceID: string;
   timeCreated: string;
   model: string;
   provider: string;
   inputTokens: number;
   outputTokens: number;
   reasoningTokens: number;
   cacheReadTokens: number;
   cacheWrite5mTokens: number;
   cacheWrite1hTokens: number;
   totalInputLikeTokens: number;
   costRaw: number;
   costUsd: number;
   sessionID: string;
   page: number;
}

interface OpencodeUsageFetchResult {
   ok: true;
   workspaceId: string;
   pagesFetched: number;
   rows: OpencodeUsageRow[];
   quota?: {
       rolling: OpencodeQuotaWindow;
       weekly: OpencodeQuotaWindow;
       monthly: OpencodeQuotaWindow;
   };
   totals: {
       rows: number;
       inputTokens: number;
       outputTokens: number;
       reasoningTokens: number;
       cacheReadTokens: number;
       cacheWrite5mTokens: number;
       cacheWrite1hTokens: number;
       totalInputLikeTokens: number;
       costUsd: number;
   };
   warnings: string[];
}

async function fetchOpencodeUsage(input: OpencodeUsageRequestInput): Promise<OpencodeUsageFetchResult> {
   const workspaceId = String(input.workspaceId ?? extractWorkspaceIdFromUsageUrl(input.usageUrl) ?? "").trim();
   const authCookie = String(input.authCookie ?? "").trim();
   const startPage = clampInteger(input.startPage, 2, 0, 10000);
   const maxPages = clampInteger(input.maxPages, 5, 1, 100);
   const serverId = String(input.serverId ?? "").trim();

   if (!workspaceId) {
       throw new Error("Usage URL must contain a workspace id like wrk_...");
   }
   if (!authCookie) {
       throw new Error("authCookie is required.");
   }

   const cookieHeader = normalizeOpencodeCookie(authCookie);
   const warnings: string[] = [];
   let quota: OpencodeUsageFetchResult["quota"] | undefined;

   try {
       quota = await fetchOpencodeQuotaSnapshot(workspaceId, cookieHeader);
   } catch (err) {
       warnings.push(`Could not load OpenCode quota percentages from /go: ${err instanceof Error ? err.message : String(err)}`);
   }

   if (!serverId) {
       return {
           ok: true,
           workspaceId,
           pagesFetched: 0,
           rows: [],
           quota,
           totals: emptyUsageTotals(),
           warnings: [
               ...warnings,
               "Usage detail was not loaded because x-server-id was not provided. Use the detail button with x-server-id to load _server rows.",
           ],
       };
   }

   const detail = await fetchOpencodeUsageDetail(input);
   return {
       ...detail,
       quota,
       warnings: [...warnings, ...detail.warnings],
   };
}

async function fetchOpencodeUsageDetail(input: OpencodeUsageRequestInput): Promise<OpencodeUsageFetchResult> {
   const workspaceId = String(input.workspaceId ?? extractWorkspaceIdFromUsageUrl(input.usageUrl) ?? "").trim();
   const authCookie = String(input.authCookie ?? "").trim();
   const startPage = clampInteger(input.startPage, OPENCODE_USAGE_DETAIL_DEFAULT_START_PAGE, 0, 10000);
   const maxPages = clampInteger(input.maxPages, OPENCODE_USAGE_DETAIL_MAX_AUTO_PAGES, 1, OPENCODE_USAGE_DETAIL_MAX_AUTO_PAGES);
   const serverId = String(input.serverId ?? "").trim();

   if (!workspaceId) {
       throw new Error("Usage URL must contain a workspace id like wrk_...");
   }
   if (!authCookie) {
       throw new Error("authCookie is required.");
   }
   if (!serverId) {
       throw new Error("x-server-id is required for usage detail. Copy it from Chrome DevTools/curl header.");
   }

   const cookieHeader = normalizeOpencodeCookie(authCookie);
   const rowsById = new Map<string, OpencodeUsageRow>();
   const warnings: string[] = [];
   const monthStart = startOfCurrentMonth();
   let pagesFetched = 0;
   let reachedBeforeMonthStart = false;

   for (let page = startPage; page < startPage + maxPages; page++) {
       const body = {
           t: {
               t: 9,
               i: 0,
               l: 2,
               a: [
                   { t: 1, s: workspaceId },
                   { t: 0, s: page },
               ],
               o: 0,
           },
           f: 31,
           m: [],
       };

       const headers: Record<string, string> = {
           "accept": "*/*",
           "accept-language": "es-ES,es;q=0.9",
           "content-type": "application/json",
           "cookie": cookieHeader,
           "origin": "https://opencode.ai",
           "referer": `https://opencode.ai/workspace/${encodeURIComponent(workspaceId)}/usage`,
           "user-agent": "Mozilla/5.0 OpenCodeGoCopilotSniffer/1.0",
           "x-server-instance": `server-fn:${page}`,
       };

       if (serverId) {
           headers["x-server-id"] = serverId;
       }

       const response = await fetch("https://opencode.ai/_server", {
           method: "POST",
           headers,
           body: JSON.stringify(body),
       });

       const text = await response.text();
       pagesFetched += 1;

       if (!response.ok) {
           throw new Error(`OpenCode usage request failed on page ${page}: HTTP ${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
       }

       const pageRows = parseOpencodeUsageResponse(text, page);

       if (pageRows.length === 0) {
           warnings.push(`Page ${page} returned no usage rows.`);
           break;
       }

       for (const row of pageRows) {
           const rowDate = Date.parse(row.timeCreated);
           if (Number.isFinite(rowDate) && rowDate < monthStart.getTime()) {
               reachedBeforeMonthStart = true;
           }
       }

       for (const row of pageRows) {
           const rowDate = Date.parse(row.timeCreated);
           if (Number.isFinite(rowDate) && rowDate < monthStart.getTime()) {
               continue;
           }
           rowsById.set(row.id, row);
       }

       if (reachedBeforeMonthStart) {
           break;
       }
   }

   const rows = Array.from(rowsById.values()).sort((a, b) => Date.parse(b.timeCreated) - Date.parse(a.timeCreated));
   const totals = rows.reduce((acc, row) => {
       acc.rows += 1;
       acc.inputTokens += row.inputTokens;
       acc.outputTokens += row.outputTokens;
       acc.reasoningTokens += row.reasoningTokens;
       acc.cacheReadTokens += row.cacheReadTokens;
       acc.cacheWrite5mTokens += row.cacheWrite5mTokens;
       acc.cacheWrite1hTokens += row.cacheWrite1hTokens;
       acc.totalInputLikeTokens += row.totalInputLikeTokens;
       acc.costUsd += row.costUsd;
       return acc;
   }, {
       rows: 0,
       inputTokens: 0,
       outputTokens: 0,
       reasoningTokens: 0,
       cacheReadTokens: 0,
       cacheWrite5mTokens: 0,
       cacheWrite1hTokens: 0,
       totalInputLikeTokens: 0,
       costUsd: 0,
   });

   totals.costUsd = Math.round(totals.costUsd * 1000000) / 1000000;

   if (!reachedBeforeMonthStart && pagesFetched >= maxPages) {
       warnings.push(`Stopped after ${maxPages} pages as a safety limit. Older current-month rows may exist.`);
   }

   return {
       ok: true,
       workspaceId,
       pagesFetched,
       rows,
       totals,
       warnings,
   };
}

function emptyUsageTotals(): OpencodeUsageFetchResult["totals"] {
   return {
       rows: 0,
       inputTokens: 0,
       outputTokens: 0,
       reasoningTokens: 0,
       cacheReadTokens: 0,
       cacheWrite5mTokens: 0,
       cacheWrite1hTokens: 0,
       totalInputLikeTokens: 0,
       costUsd: 0,
   };
}

function startOfCurrentMonth(): Date {
   const now = new Date();
   return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

async function fetchOpencodeQuotaSnapshot(workspaceId: string, cookieHeader: string): Promise<{
   rolling: OpencodeQuotaWindow;
   weekly: OpencodeQuotaWindow;
   monthly: OpencodeQuotaWindow;
}> {
   const response = await fetch(`https://opencode.ai/workspace/${encodeURIComponent(workspaceId)}/go`, {
       method: "GET",
       headers: {
           "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
           "accept-language": "es-ES,es;q=0.9,en;q=0.8",
           "cookie": cookieHeader,
           "referer": `https://opencode.ai/workspace/${encodeURIComponent(workspaceId)}`,
           "user-agent": "Mozilla/5.0 OpenCodeGoCopilotSniffer/1.0",
       },
       redirect: "follow",
   });

   const html = await response.text();
   if (!response.ok) {
       throw new Error(`HTTP ${response.status} ${response.statusText}: ${html.slice(0, 300)}`);
   }

   return parseOpencodeQuotaHtml(html);
}

function parseOpencodeQuotaHtml(html: string): {
   rolling: OpencodeQuotaWindow;
   weekly: OpencodeQuotaWindow;
   monthly: OpencodeQuotaWindow;
} {
   const extractWindow = (name: string): OpencodeQuotaWindow => {
       const patterns = [
           new RegExp(`${name}:\\$R\\[\\d+\\]=\\{status:"([^"]+)",resetInSec:(\\d+),usagePercent:(\\d+)\\}`),
           new RegExp(`${name}=\\{status:"([^"]+)",resetInSec:(\\d+),usagePercent:(\\d+)\\}`),
       ];

       for (const pattern of patterns) {
           const match = pattern.exec(html);
           if (match) {
               const status = match[1] === "ok" || match[1] === "error" ? match[1] : "unknown";
               return {
                   status,
                   resetsInSeconds: Number(match[2]),
                   usagePercent: Number(match[3]),
               };
           }
       }

       return { status: "unknown", resetsInSeconds: 0, usagePercent: 0 };
   };

   const rolling = extractWindow("rollingUsage");
   const weekly = extractWindow("weeklyUsage");
   const monthly = extractWindow("monthlyUsage");

   if (rolling.status === "unknown" && weekly.status === "unknown" && monthly.status === "unknown") {
       throw new Error("Could not find rollingUsage, weeklyUsage or monthlyUsage in OpenCode HTML.");
   }

   return { rolling, weekly, monthly };
}

function parseOpencodeUsageResponse(text: string, page: number): OpencodeUsageRow[] {
   const rows: OpencodeUsageRow[] = [];
   const regex = /id:\s*"(?<id>usg_[^"]+)"[\s\S]*?workspaceID:\s*"(?<workspaceID>[^"]+)"[\s\S]*?timeCreated:\s*(?:\$R\[\d+\]\s*=\s*)?new Date\("(?<timeCreated>[^"]+)"\)[\s\S]*?model:\s*"(?<model>[^"]*)"[\s\S]*?provider:\s*"(?<provider>[^"]*)"[\s\S]*?inputTokens:\s*(?<inputTokens>-?\d+|null)[\s\S]*?outputTokens:\s*(?<outputTokens>-?\d+|null)[\s\S]*?reasoningTokens:\s*(?<reasoningTokens>-?\d+|null)[\s\S]*?cacheReadTokens:\s*(?<cacheReadTokens>-?\d+|null)[\s\S]*?cacheWrite5mTokens:\s*(?<cacheWrite5mTokens>-?\d+|null)[\s\S]*?cacheWrite1hTokens:\s*(?<cacheWrite1hTokens>-?\d+|null)[\s\S]*?cost:\s*(?<cost>-?\d+|null)[\s\S]*?sessionID:\s*"(?<sessionID>[^"]*)"/g;

   for (const match of text.matchAll(regex)) {
       const groups = match.groups ?? {};
       const inputTokens = parseNullableNumber(groups.inputTokens);
       const outputTokens = parseNullableNumber(groups.outputTokens);
       const reasoningTokens = parseNullableNumber(groups.reasoningTokens);
       const cacheReadTokens = parseNullableNumber(groups.cacheReadTokens);
       const cacheWrite5mTokens = parseNullableNumber(groups.cacheWrite5mTokens);
       const cacheWrite1hTokens = parseNullableNumber(groups.cacheWrite1hTokens);
       const costRaw = parseNullableNumber(groups.cost);

       rows.push({
           id: groups.id ?? "",
           workspaceID: groups.workspaceID ?? "",
           timeCreated: groups.timeCreated ?? "",
           model: groups.model ?? "",
           provider: groups.provider ?? "",
           inputTokens,
           outputTokens,
           reasoningTokens,
           cacheReadTokens,
           cacheWrite5mTokens,
           cacheWrite1hTokens,
           totalInputLikeTokens: inputTokens + cacheReadTokens + cacheWrite5mTokens + cacheWrite1hTokens,
           costRaw,
           costUsd: costRaw / 100000000,
           sessionID: groups.sessionID ?? "",
           page,
       });
   }

   return rows;
}

function parseNullableNumber(value: string | undefined): number {
   if (!value || value === "null") return 0;
   const parsed = Number(value);
   return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeOpencodeCookie(value: string): string {
   const trimmed = value.trim();
   if (trimmed.includes("=")) {
       return trimmed.includes("oc_locale=") ? trimmed : `${trimmed}; oc_locale=es`;
   }
   return `auth=${trimmed}; oc_locale=es`;
}

function extractWorkspaceIdFromUsageUrl(value: unknown): string {
   const text = String(value ?? "").trim();
   if (!text) return "";

   const direct = text.match(/\b(wrk_[A-Za-z0-9]+)\b/);
   if (direct) return direct[1];

   try {
       const url = new URL(text);
       const match = url.pathname.match(/\/workspace\/(wrk_[A-Za-z0-9]+)(?:\/|$)/);
       return match ? match[1] : "";
   } catch {
       return "";
   }
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
   const parsed = Number(value);
   if (!Number.isInteger(parsed)) return fallback;
   return Math.max(min, Math.min(max, parsed));
}

function readJsonBody<T>(req: http.IncomingMessage, maxBytes = 1024 * 1024): Promise<T> {
   return new Promise<T>((resolve, reject) => {
       let body = "";
       req.setEncoding("utf8");
       req.on("data", (chunk) => {
           body += chunk;
           if (Buffer.byteLength(body, "utf8") > maxBytes) {
               reject(new Error("Request body too large."));
               req.destroy();
           }
       });
       req.on("end", () => {
           try {
               resolve(JSON.parse(body || "{}") as T);
           } catch (err) {
               reject(err);
           }
       });
       req.on("error", reject);
   });
}

function dashboardHtml(token: string): string {
   const escapedToken = token.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
   return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>OpenCode GO Sniffer</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:24px;background:#111;color:#eee}
button,input{font:inherit}
button{background:#252525;color:#eee;border:1px solid #444;border-radius:8px;padding:6px 10px;cursor:pointer}
button:hover{background:#333}
button.tabButton.active{background:#315a8a;border-color:#6aa9ff;color:#fff}
button.tabButton.active:hover{background:#38669c}
.topTabs{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}
.topTabButton.active{background:#315a8a;border-color:#6aa9ff;color:#fff}
.page{display:none}
.page.active{display:block}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:16px 0}
.card{background:#1d1d1d;border:1px solid #333;border-radius:10px;padding:14px}
.muted{color:#aaa}
.usagePanel{background:#151515;border:1px solid #333;border-radius:12px;padding:14px;margin:18px 0}
.usageForm{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:12px 0}
.usageForm label{display:flex;flex-direction:column;gap:5px;color:#aaa}
.usageForm input{background:#080808;color:#eee;border:1px solid #444;border-radius:8px;padding:7px}
.usageTable{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
.usageTable th,.usageTable td{border-bottom:1px solid #333;padding:7px;text-align:left}
.usageTable th{color:#aaa;font-weight:600}
.quotaGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin:16px 0}
.quotaCard{background:#1d1d1d;border:1px solid #333;border-radius:14px;padding:14px}
.quotaTop{display:flex;justify-content:space-between;gap:10px;align-items:center}
.quotaPct{font-size:28px;font-weight:800}
.progress{height:12px;background:#070707;border:1px solid #333;border-radius:999px;overflow:hidden;margin:12px 0}
.progressFill{height:100%;background:linear-gradient(90deg,#57d88a,#ffd166,#ff6b6b);width:0%}
.chartBox{background:#151515;border:1px solid #333;border-radius:12px;padding:14px;margin:16px 0}
.chartSvg{width:100%;height:220px;display:block;background:#0b0b0b;border:1px solid #252525;border-radius:10px}
.row{padding:10px;border-bottom:1px solid #333;cursor:pointer}
.row:hover{background:#1a1a1a}
.row.selected{background:#202a38}
pre{white-space:pre-wrap;background:#050505;border:1px solid #333;border-radius:10px;padding:12px;overflow:auto}
code{font-family:ui-monospace,SFMono-Regular,Consolas,Liberation Mono,Menlo,monospace;font-size:13px;line-height:1.45}
.ok{color:#8ee99a}.error{color:#ff8c8c}.running{color:#ffd580}.aborted{color:#ffcc88}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
.split{display:grid;grid-template-columns:minmax(260px,420px) 1fr;gap:16px;align-items:start}
@media(max-width:900px){.split{grid-template-columns:1fr}}
.badge{display:inline-block;border:1px solid #444;border-radius:999px;padding:2px 8px;margin-left:6px;color:#ccc;font-size:12px}
.warn{color:#ffd580}
.jsonTree{font-family:ui-monospace,SFMono-Regular,Consolas,Liberation Mono,Menlo,monospace;font-size:13px;line-height:1.45}
.jsonLine{padding:2px 0}
.jsonKey{color:#9cdcfe;cursor:pointer}
.jsonKey:hover{text-decoration:underline}
.jsonValue{color:#ce9178;cursor:pointer}
.jsonValue:hover{text-decoration:underline}
.jsonPrimitive{color:#b5cea8}
.jsonNull{color:#569cd6}
.modalBackdrop{position:fixed;inset:0;background:rgba(0,0,0,.72);display:none;align-items:center;justify-content:center;z-index:9999}
.modalBackdrop.open{display:flex}
.modal{width:min(1100px,92vw);height:min(760px,88vh);background:#161616;border:1px solid #444;border-radius:14px;box-shadow:0 20px 70px rgba(0,0,0,.7);display:flex;flex-direction:column}
.modalHeader{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid #333;padding:12px 14px}
.modalTitle{font-weight:700}
.modalHint{color:#888;font-size:12px;margin-top:4px}
.modalPath{color:#aaa;font-family:ui-monospace,SFMono-Regular,Consolas,Liberation Mono,Menlo,monospace;font-size:12px;margin-top:4px;word-break:break-all}
.modalBody{padding:14px;overflow:auto;white-space:pre-wrap}
.modalBody code{display:block;white-space:pre-wrap}
.modalActions{display:flex;gap:8px}
</style>
</head>
<body>
<h1>OpenCode GO Sniffer</h1>
<p class="muted">Local Sniffer dashboard. Token auth is embedded in this URL.</p>

<div class="topTabs">
 <button id="showSnifferPageBtn" class="topTabButton" data-page="sniffer">🕵️ Sniffer</button>
 <button id="showUsagePageBtn" class="topTabButton" data-page="usage">📊 Usage</button>
</div>

<main id="snifferPage" class="page">
<div class="toolbar">
 <button id="refreshBtn">Refresh</button>
 <button id="clearBtn">Clear</button>
</div>
<div id="summary" class="cards"></div>

</main>

<main id="usagePage" class="page">
<section class="usagePanel">
 <h2>OpenCode Usage</h2>
 <p class="muted">
   Paste your OpenCode usage URL and auth cookie. The cookie is stored only in this browser localStorage.
   The local Sniffer server calls opencode.ai server-side to avoid CORS/cookie limitations. Quota percentages are read from the OpenCode /go page.
 </p>
 <div class="usageForm">
   <label>
     Usage URL
     <input id="ocUsageUrl" placeholder="https://opencode.ai/workspace/wrk_.../usage" autocomplete="off" />
   </label>
   <label>
     Auth cookie
     <input id="ocAuthCookie" placeholder="auth=... or raw cookie value" autocomplete="off" type="password" />
   </label>
   <label>
     x-server-id for detail
     <input id="ocServerId" placeholder="Required only for Load usage detail. Copy x-server-id from Chrome DevTools/curl." autocomplete="off" />
   </label>
 </div>
 <div class="toolbar">
   <button id="loadOpenCodeQuotaBtn">Load current usage</button>
   <button id="loadOpenCodeUsageDetailBtn">Load usage detail</button>
   <button id="clearOpenCodeUsageConfigBtn">Clear usage config</button>
 </div>
 <div id="ocUsageStatus" class="muted">Not loaded.</div>
 <div id="ocQuotaSummary" class="quotaGrid"></div>
 <div id="ocUsageSummary" class="cards"></div>
 <div id="ocUsageWarnings" class="muted"></div>
 <div id="ocUsageCharts"></div>
 <div style="overflow:auto">
   <table id="ocUsageTable" class="usageTable"></table>
 </div>
</section>
</main>

<main id="snifferBodyPage" class="page active">
<div class="split">
 <section>
   <h2>Requests</h2>
   <div id="requests"></div>
 </section>

 <section>
   <h2>Detail <span id="selectedId" class="badge"></span></h2>
   <div class="toolbar">
     <button id="showSummaryBtn" class="tabButton" data-view="summary">🧾 Summary</button>
     <button id="showRequestBtn" class="tabButton" data-view="request">📤 Request</button>
     <button id="showResponseBtn" class="tabButton" data-view="response">📥 Response</button>
     <button id="copyVisibleBtn">📋 Copy</button>
   </div>
   <label class="muted" style="display:flex;gap:8px;align-items:center;margin:8px 0">
     <input id="showFullStringsToggle" type="checkbox" /> Show full strings in tree
   </label>
   <p id="hint" class="muted">Select a request</p>
   <pre><code id="detail">Select a request</code></pre>
 </section>
</div>
</main>
<div id="valueModal" class="modalBackdrop">
 <div class="modal">
   <div class="modalHeader">
     <div>
       <div class="modalTitle">Field value</div>
       <div id="modalPath" class="modalPath"></div>
       <div class="modalHint">Mouse wheel scroll is captured inside this window.</div>
     </div>
     <div class="modalActions">
       <button id="copyModalBtn">📋 Copy</button>
       <button id="closeModalBtn">✕ Close</button>
     </div>
   </div>
   <pre class="modalBody"><code id="modalValue"></code></pre>
 </div>
</div>
<script>
const token = "${escapedToken}";
let selectedRequest = null;
let currentView = 'summary';
let currentText = '';
const VALID_VIEWS = new Set(['summary', 'request', 'response']);
const VALID_PAGES = new Set(['sniffer', 'usage']);
const CURRENT_PAGE_KEY = 'opencodegosniffer.currentDashboardPage';
const SHOW_FULL_STRINGS_KEY = 'opencodegosniffer.showFullStringsInTree';
const OC_USAGE_URL_KEY = 'opencodegosniffer.openCodeUsage.usageUrl';
const OC_USAGE_COOKIE_KEY = 'opencodegosniffer.openCodeUsage.authCookie';
const OC_USAGE_SERVER_ID_KEY = 'opencodegosniffer.openCodeUsage.serverId';
let showFullStringsInTree = localStorage.getItem(SHOW_FULL_STRINGS_KEY) === 'true';

async function api(path, init){
 const separator = path.includes('?') ? '&' : '?';
 const r = await fetch(path + separator + 'token=' + encodeURIComponent(token), init);
 if (!r.ok) {
   const text = await r.text();
   throw new Error('HTTP ' + r.status + ': ' + text);
 }
 return r.json();
}

function esc(value){
 return String(value ?? '').replace(/[&<>"']/g, c => ({
   '&':'&amp;',
   '<':'&lt;',
   '>':'&gt;',
   '"':'&quot;',
   "'":'&#39;'
 }[c]));
}

let modalCurrentText = '';

function normalizeEscapedText(value){
 if (typeof value !== 'string') return value;

 // Si viene como string JSON escapado, por ejemplo "\\n", intenta desescaparlo.
 try {
   return JSON.parse(JSON.stringify(value));
 } catch {
   return value;
 }
}

function pretty(value){
 if (value === undefined || value === null || value === '') return '';
 if (typeof value === 'string') {
   try {
     return JSON.stringify(JSON.parse(value), null, 2);
   } catch {
     return value;
   }
 }
 return JSON.stringify(value, null, 2);
}

function pathJoin(base, key){
 if (base === '') return String(key);
 if (/^\d+$/.test(String(key))) return base + '[' + key + ']';
 if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(key))) return base + '.' + key;
 return base + '[' + encodeURIComponent(String(key)) + ']';
}

function openValueModal(path, value){
 const normalized = normalizeEscapedText(value);
 const text = typeof normalized === 'string' ? normalized : pretty(normalized);

 modalCurrentText = text;
 document.getElementById('modalPath').textContent = path;
 document.getElementById('modalValue').textContent = text;
 document.getElementById('valueModal').classList.add('open');
 document.body.style.overflow = 'hidden';
}

function closeValueModal(){
 document.getElementById('valueModal').classList.remove('open');
 document.body.style.overflow = '';
}

function renderJsonTree(value, path = ''){
 if (value === undefined) {
   return '<span class="jsonPrimitive">undefined</span>';
 }

 if (value === null) {
   return '<span class="jsonNull" data-path="'+esc(path)+'">null</span>';
 }

 if (typeof value === 'string') {
   const preview = !showFullStringsInTree && value.length > 180 ? value.slice(0, 180) + '…' : value;
   return '<span class="jsonValue" data-path="'+esc(path)+'" data-kind="value">"'+esc(preview)+'"</span>';
 }

 if (typeof value === 'number' || typeof value === 'boolean') {
   return '<span class="jsonPrimitive" data-path="'+esc(path)+'" data-kind="value">'+esc(value)+'</span>';
 }

 if (Array.isArray(value)) {
   if (value.length === 0) return '[]';
   return '[<div style="padding-left:18px">' +
     value.map((item, index) => {
       const childPath = pathJoin(path, index);
       return '<div class="jsonLine"><span class="jsonKey" data-path="'+esc(childPath)+'">'+index+'</span>: '+renderJsonTree(item, childPath)+'</div>';
     }).join('') +
     '</div>]';
 }

 const entries = Object.entries(value);
 if (entries.length === 0) return '{}';

 return '{<div style="padding-left:18px">' +
   entries.map(([key, child]) => {
     const childPath = pathJoin(path, key);
     return '<div class="jsonLine"><span class="jsonKey" data-path="'+esc(childPath)+'">'+esc(key)+'</span>: '+renderJsonTree(child, childPath)+'</div>';
   }).join('') +
   '</div>}';
}

function getByPath(root, path){
 if (!path) return root;

 const parts = [];
 let i = 0;

 while (i < path.length) {
   if (path[i] === '.') {
     i++;
     continue;
   }

   if (path[i] === '[') {
     const end = path.indexOf(']', i);
     if (end === -1) break;
     const raw = path.slice(i + 1, end);
     if (/^\\d+$/.test(raw)) {
       parts.push(Number(raw));
     } else {
       parts.push(decodeURIComponent(raw));
     }
     i = end + 1;
     continue;
   }

   let end = i;
   while (end < path.length && path[end] !== '.' && path[end] !== '[') {
     end++;
   }
   const part = path.slice(i, end);
   if (part) {
     parts.push(part);
   }
   i = end;
 }

 let current = root;
 // The rendered tree root is named "requestBody" or "summary"; it is only a display prefix.
 for (const part of parts[0] === 'requestBody' || parts[0] === 'summary' ? parts.slice(1) : parts) {
   if (current === undefined || current === null) return undefined;
   current = current[part];
 }
 return current;
}

function attachJsonTreeHandlers(rootValue){
 document.querySelectorAll('#detail .jsonKey,#detail .jsonValue,#detail .jsonPrimitive,#detail .jsonNull').forEach(el => {
   el.addEventListener('click', event => {
     event.stopPropagation();
     const path = el.getAttribute('data-path') ?? '';
     openValueModal(path, getByPath(rootValue, path));
   });
 });
}

function card(label,value){
 return '<div class="card"><div class="muted">'+esc(label)+'</div><div><strong>'+esc(value)+'</strong></div></div>';
}

function formatNumber(value){
 return new Intl.NumberFormat().format(Number(value || 0));
}

function formatUsd(value){
 return '$' + Number(value || 0).toFixed(6);
}

function formatDate(value){
 if (!value) return '';
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return value;
 return date.toLocaleString();
}

function formatTime(seconds){
 seconds = Math.max(0, Number(seconds || 0));
 const days = Math.floor(seconds / 86400);
 const hours = Math.floor((seconds % 86400) / 3600);
 const minutes = Math.floor((seconds % 3600) / 60);
 if (days > 0) return days + 'd ' + hours + 'h';
 if (hours > 0) return hours + 'h ' + minutes + 'm';
 return minutes + 'm';
}

function extractWorkspaceIdFromUsageUrl(value){
 const text = String(value || '').trim();
 if (!text) return '';

 const direct = text.match(/\\b(wrk_[A-Za-z0-9]+)\\b/);
 if (direct) return direct[1];

 try {
   const url = new URL(text);
   const match = url.pathname.match(/\\/workspace\\/(wrk_[A-Za-z0-9]+)(?:\\/|$)/);
   return match ? match[1] : '';
 } catch {
   return '';
 }
}

function syncWorkspaceFromUsageUrl(){
 // Kept as a small validation helper; the workspace is now sent from usageUrl.
 return extractWorkspaceIdFromUsageUrl(document.getElementById('ocUsageUrl').value.trim());
}

function initOpenCodeUsageForm(){
 document.getElementById('ocUsageUrl').value = localStorage.getItem(OC_USAGE_URL_KEY) || '';
 document.getElementById('ocAuthCookie').value = localStorage.getItem(OC_USAGE_COOKIE_KEY) || '';
 document.getElementById('ocServerId').value = localStorage.getItem(OC_USAGE_SERVER_ID_KEY) || '';
}

function persistOpenCodeUsageForm(){
 localStorage.setItem(OC_USAGE_URL_KEY, document.getElementById('ocUsageUrl').value.trim());
 localStorage.setItem(OC_USAGE_COOKIE_KEY, document.getElementById('ocAuthCookie').value.trim());
 localStorage.setItem(OC_USAGE_SERVER_ID_KEY, document.getElementById('ocServerId').value.trim());
}

function clearOpenCodeUsageConfig(){
 localStorage.removeItem(OC_USAGE_URL_KEY);
 localStorage.removeItem(OC_USAGE_COOKIE_KEY);
 localStorage.removeItem(OC_USAGE_SERVER_ID_KEY);
 initOpenCodeUsageForm();
 document.getElementById('ocUsageStatus').textContent = 'Usage config cleared.';
 document.getElementById('ocQuotaSummary').innerHTML = '';
 document.getElementById('ocUsageSummary').innerHTML = '';
 document.getElementById('ocUsageWarnings').textContent = '';
 document.getElementById('ocUsageCharts').innerHTML = '';
 document.getElementById('ocUsageTable').innerHTML = '';
}

function readUsageForm(){
 persistOpenCodeUsageForm();

 const usageUrl = document.getElementById('ocUsageUrl').value.trim();
 const workspaceId = extractWorkspaceIdFromUsageUrl(usageUrl);
 const authCookie = document.getElementById('ocAuthCookie').value.trim();
 const startPage = 0;
 const maxPages = 100;
 const serverId = document.getElementById('ocServerId').value.trim();

 if (!workspaceId) {
   throw new Error('Usage URL must contain a workspace id like wrk_...');
 }
 if (!authCookie) {
   throw new Error('Auth cookie is required.');
 }

 return { usageUrl, workspaceId, authCookie, startPage, maxPages, serverId };
}

async function loadOpenCodeQuota(){
 const form = readUsageForm();
 document.getElementById('ocUsageStatus').textContent = 'Loading current OpenCode usage...';
 document.getElementById('ocUsageWarnings').textContent = '';

 const result = await api('/api/opencode/quota', {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({
     usageUrl: form.usageUrl,
     workspaceId: form.workspaceId,
     authCookie: form.authCookie,
   }),
 });

 document.getElementById('ocUsageStatus').textContent = 'Current OpenCode usage loaded.';
 renderQuotaSummary(result.quota);
 document.getElementById('ocUsageWarnings').textContent = '';
}

async function loadOpenCodeUsageDetail(){
 const form = readUsageForm();
 if (!form.serverId) {
   throw new Error('x-server-id is required for usage detail. Copy it from Chrome DevTools/curl header.');
 }

 document.getElementById('ocUsageStatus').textContent = 'Loading current-month OpenCode usage detail from _server...';
 document.getElementById('ocUsageWarnings').textContent = '';

 const result = await api('/api/opencode/usage-detail', {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify(form),
 });

 document.getElementById('ocUsageStatus').textContent =
   'Loaded current-month detail: ' + result.rows.length + ' rows. Scanned ' + result.pagesFetched + ' internal page(s).';

 renderQuotaSummary(result.quota);
 renderUsageDetail(result);
}

function renderUsageDetail(result){
 document.getElementById('ocUsageSummary').innerHTML =
   card('Rows', formatNumber(result.totals.rows))+
   card('Input tokens', formatNumber(result.totals.inputTokens))+
   card('Output tokens', formatNumber(result.totals.outputTokens))+
   card('Reasoning tokens', formatNumber(result.totals.reasoningTokens))+
   card('Cache read tokens', formatNumber(result.totals.cacheReadTokens))+
   card('Input + cache tokens', formatNumber(result.totals.totalInputLikeTokens))+
   card('Cost', formatUsd(result.totals.costUsd));

 document.getElementById('ocUsageWarnings').textContent = (result.warnings || []).join(' ');

 const rows = result.rows || [];
 renderUsageCharts(rows);

 if (!rows.length) {
   document.getElementById('ocUsageTable').innerHTML = '';
   return;
 }

 document.getElementById('ocUsageTable').innerHTML =
   '<thead><tr>'+
     '<th>Date</th><th>Model</th><th>Provider</th><th>Input</th><th>Output</th><th>Reasoning</th><th>Cache read</th><th>Cost</th><th>Session</th>'+
   '</tr></thead>'+
   '<tbody>'+
   rows.map(row =>
     '<tr>'+
       '<td title="'+esc(row.timeCreated)+'">'+esc(formatDate(row.timeCreated))+'</td>'+
       '<td>'+esc(row.model)+'</td>'+
       '<td>'+esc(row.provider)+'</td>'+
       '<td>'+esc(formatNumber(row.inputTokens))+'</td>'+
       '<td>'+esc(formatNumber(row.outputTokens))+'</td>'+
       '<td>'+esc(formatNumber(row.reasoningTokens))+'</td>'+
       '<td>'+esc(formatNumber(row.cacheReadTokens))+'</td>'+
       '<td>'+esc(formatUsd(row.costUsd))+'</td>'+
       '<td>'+esc(row.sessionID || '')+'</td>'+
     '</tr>'
   ).join('')+
   '</tbody>';
}

function renderQuotaSummary(quota){
 if (!quota) {
   document.getElementById('ocQuotaSummary').innerHTML =
     '<div class="quotaCard"><div class="muted">Quota</div><strong>Not available</strong></div>';
   return;
 }

 document.getElementById('ocQuotaSummary').innerHTML =
   quotaCard('Rolling 5h', quota.rolling)+
   quotaCard('Weekly', quota.weekly)+
   quotaCard('Monthly', quota.monthly);
}

function quotaCard(label, item){
 const pct = Math.max(0, Math.min(100, Number(item?.usagePercent || 0)));
 const status = item?.status || 'unknown';
 const reset = formatTime(item?.resetsInSeconds || 0);
 return '<div class="quotaCard">'+
   '<div class="quotaTop"><div><div class="muted">'+esc(label)+'</div><strong>'+esc(status)+'</strong></div><div class="quotaPct">'+esc(Math.round(pct))+'%</div></div>'+
   '<div class="progress"><div class="progressFill" style="width:'+esc(pct)+'%"></div></div>'+
   '<div class="muted">Resets in '+esc(reset)+'</div>'+
 '</div>';
}

function aggregateUsageByDay(rows){
 const map = new Map();
 for (const row of rows || []) {
   const date = new Date(row.timeCreated);
   if (Number.isNaN(date.getTime())) continue;
   const key = date.toISOString().slice(0, 10);
   const current = map.get(key) || { day: key, costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0 };
   current.costUsd += Number(row.costUsd || 0);
   current.inputTokens += Number(row.inputTokens || 0);
   current.outputTokens += Number(row.outputTokens || 0);
   current.reasoningTokens += Number(row.reasoningTokens || 0);
   current.cacheReadTokens += Number(row.cacheReadTokens || 0);
   map.set(key, current);
 }
 return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
}

function renderUsageCharts(rows){
 const daily = aggregateUsageByDay(rows);
 if (!daily.length) {
   document.getElementById('ocUsageCharts').innerHTML = '';
   return;
 }

 document.getElementById('ocUsageCharts').innerHTML =
   '<div class="chartBox"><h3>Daily cost</h3>'+renderBarChart(daily, 'costUsd', value => formatUsd(value))+'</div>'+
   '<div class="chartBox"><h3>Daily tokens</h3>'+renderBarChart(daily, 'totalTokens', value => formatNumber(value), item => Number(item.inputTokens || 0) + Number(item.outputTokens || 0) + Number(item.reasoningTokens || 0) + Number(item.cacheReadTokens || 0))+'</div>';
}

function renderBarChart(items, field, formatter, valueGetter){
 const width = 900;
 const height = 220;
 const paddingLeft = 46;
 const paddingBottom = 34;
 const paddingTop = 18;
 const paddingRight = 18;
 const chartWidth = width - paddingLeft - paddingRight;
 const chartHeight = height - paddingTop - paddingBottom;
 const values = items.map(item => valueGetter ? valueGetter(item) : Number(item[field] || 0));
 const max = Math.max(1, ...values);
 const barGap = 6;
 const barWidth = Math.max(6, (chartWidth - barGap * Math.max(0, items.length - 1)) / items.length);

 const bars = items.map((item, index) => {
   const value = values[index];
   const barHeight = Math.max(1, (value / max) * chartHeight);
   const x = paddingLeft + index * (barWidth + barGap);
   const y = paddingTop + chartHeight - barHeight;
   const label = item.day.slice(5);
   return '<g>'+
     '<title>'+esc(item.day + ' · ' + formatter(value))+'</title>'+
     '<rect x="'+x+'" y="'+y+'" width="'+barWidth+'" height="'+barHeight+'" rx="4"></rect>'+
     '<text x="'+(x + barWidth / 2)+'" y="'+(height - 10)+'" text-anchor="middle" font-size="10">'+esc(label)+'</text>'+
   '</g>';
 }).join('');

 return '<svg class="chartSvg" viewBox="0 0 '+width+' '+height+'" role="img">'+
   '<line x1="'+paddingLeft+'" y1="'+(paddingTop + chartHeight)+'" x2="'+(width - paddingRight)+'" y2="'+(paddingTop + chartHeight)+'" stroke="#444"></line>'+
   '<line x1="'+paddingLeft+'" y1="'+paddingTop+'" x2="'+paddingLeft+'" y2="'+(paddingTop + chartHeight)+'" stroke="#444"></line>'+
   '<text x="8" y="20" font-size="11" fill="#aaa">'+esc(formatter(max))+'</text>'+
   '<g fill="#6aa9ff">'+bars+'</g>'+
 '</svg>';
}

function updateActiveTab(){
 document.querySelectorAll('.tabButton').forEach(button => {
   button.classList.toggle('active', button.getAttribute('data-view') === currentView);
 });
}

function updateDashboardPage(){
 const hashPage = location.hash === '#usage' ? 'usage' : location.hash === '#sniffer' ? 'sniffer' : '';
 if (hashPage) {
   localStorage.setItem(CURRENT_PAGE_KEY, hashPage);
 }

 const page = hashPage || localStorage.getItem(CURRENT_PAGE_KEY) || 'sniffer';
 const activePage = VALID_PAGES.has(page) ? page : 'sniffer';
 document.querySelectorAll('.topTabButton').forEach(button => {
   button.classList.toggle('active', button.getAttribute('data-page') === activePage);
 });
 document.getElementById('snifferPage').classList.toggle('active', activePage === 'sniffer');
 document.getElementById('snifferBodyPage').classList.toggle('active', activePage === 'sniffer');
 document.getElementById('usagePage').classList.toggle('active', activePage === 'usage');
}

function setDashboardPage(page){
 if (!VALID_PAGES.has(page)) page = 'sniffer';
 localStorage.setItem(CURRENT_PAGE_KEY, page);
 history.replaceState(null, '', '#' + page);
 updateDashboardPage();
}

function setCurrentView(view){
 if (!VALID_VIEWS.has(view)) {
   view = 'summary';
 }

 currentView = view;
 localStorage.setItem('opencodegosniffer.currentDetailView', currentView);
 updateActiveTab();
 renderDetail();
}

function renderDetail(){
 const detail = document.getElementById('detail');
 const hint = document.getElementById('hint');
 const selectedId = document.getElementById('selectedId');

 if (!selectedRequest) {
   currentText = 'Select a request';
   updateActiveTab();
   detail.textContent = currentText;
   hint.textContent = 'Select a request';
   selectedId.textContent = '';
   return;
 }

 selectedId.textContent = selectedRequest.id;
 updateActiveTab();

 if (currentView === 'request') {
   if (selectedRequest.requestBody === undefined) {
     currentText = 'Request body was not captured. Enable "opencodegosniffer.localStatsCapturePayloads": true and make a new request.';
     detail.textContent = currentText;
     hint.innerHTML = '<span class="warn">Request payload not captured for this item.</span>';
   } else {
     currentText = pretty(selectedRequest.requestBody);
     detail.innerHTML = '<div class="jsonTree">'+renderJsonTree(selectedRequest.requestBody, 'requestBody')+'</div>';
     hint.textContent = 'Request body sent upstream. Click any property or value to inspect it.';
     attachJsonTreeHandlers(selectedRequest.requestBody);
   }
   return;
 }

 if (currentView === 'response') {
   const response = selectedRequest.responseText ?? selectedRequest.responsePreview;
   if (!response) {
     currentText = 'Response body was not captured yet, or this request produced no text.';
     detail.textContent = currentText;
     hint.innerHTML = '<span class="warn">Response body not available.</span>';
   } else {
     currentText = response;
     detail.textContent = response;
     hint.textContent = selectedRequest.responseText ? 'Full captured response.' : 'Response preview only. Enable payload capture for full response.';
   }
   return;
 }

 const summary = {
   id: selectedRequest.id,
   status: selectedRequest.status,
   modelId: selectedRequest.modelId,
   upstreamModelId: selectedRequest.upstreamModelId,
   apiMode: selectedRequest.apiMode,
   baseUrl: selectedRequest.baseUrl,
   url: selectedRequest.url,
   startedAt: selectedRequest.startedAt,
   endedAt: selectedRequest.endedAt,
   durationMs: selectedRequest.durationMs,
   firstTokenLatencyMs: selectedRequest.firstTokenLatencyMs,
   messageCount: selectedRequest.messageCount,
   estimatedInputTokens: selectedRequest.estimatedInputTokens,
   estimatedOutputTokens: selectedRequest.estimatedOutputTokens,
   usage: selectedRequest.usage,
   pruning: selectedRequest.pruning,
   chunkCount: selectedRequest.chunkCount,
   httpStatus: selectedRequest.httpStatus,
   error: selectedRequest.error,
   hasRequestBody: selectedRequest.requestBody !== undefined,
   hasFullResponseText: selectedRequest.responseText !== undefined,
   responsePreview: selectedRequest.responsePreview,
 };

 currentText = pretty(summary);
 detail.innerHTML = '<div class="jsonTree">'+renderJsonTree(summary, 'summary')+'</div>';
 hint.textContent = 'Request summary. Click any property or value to inspect it.';
 attachJsonTreeHandlers(summary);
}

async function refresh(){
 const s = await api('/api/summary');
 document.getElementById('summary').innerHTML =
   card('Total',s.totalRequests)+
   card('Running',s.runningRequests)+
   card('OK',s.okRequests)+
   card('Errors',s.errorRequests)+
   card('Avg ms',s.averageDurationMs ?? '-')+
   card('Prompt tokens',s.totalPromptTokens)+
   card('Completion tokens',s.totalCompletionTokens)+
   card('Payload capture',s.capturePayloads)+
   card('Pruning saved tokens',s.totalPruningSavedTokens ?? 0)+
   card('Pruning original tokens',s.totalPruningOriginalTokens ?? 0)+
   card('Avg pruning saved %',s.averagePruningSavedPercent ?? '-');

 const items = await api('/api/requests?limit=100');
 const requestsEl = document.getElementById('requests');

 requestsEl.innerHTML = items.map(r =>
   '<div class="row" data-id="'+esc(r.id)+'">'+
     '<b class="'+esc(r.status)+'">'+esc(r.status)+'</b> '+
     esc(r.modelId)+
     ' <span class="muted">'+esc(r.startedAt)+' '+esc(r.durationMs ?? '-')+'ms</span><br>'+
     '<span class="muted">'+esc(r.url ?? r.baseUrl)+'</span>'+
   '</div>'
 ).join('');

 requestsEl.querySelectorAll('.row').forEach(el => {
   el.addEventListener('click', async () => {
     requestsEl.querySelectorAll('.row').forEach(row => row.classList.remove('selected'));
     el.classList.add('selected');
     selectedRequest = await api('/api/requests/'+encodeURIComponent(el.getAttribute('data-id')));
     renderDetail();
   });
 });

 if (selectedRequest) {
   const updated = items.find(r => r.id === selectedRequest.id);
   if (updated) {
     selectedRequest = await api('/api/requests/'+encodeURIComponent(selectedRequest.id));
     renderDetail();
   }
 }
}

async function clearAll(){
 await api('/api/clear',{method:'POST'});
 selectedRequest = null;
 await refresh();
 renderDetail();
}

async function copyVisible(){
 await navigator.clipboard.writeText(currentText || '');
}

function initShowFullStringsToggle(){
 const toggle = document.getElementById('showFullStringsToggle');
 toggle.checked = showFullStringsInTree;
 toggle.addEventListener('change', () => {
   showFullStringsInTree = toggle.checked;
   localStorage.setItem(SHOW_FULL_STRINGS_KEY, String(showFullStringsInTree));
   renderDetail();
 });
}

function stopWheelPropagationInsideModal(){
 const modalBody = document.querySelector('.modalBody');
 modalBody.addEventListener('wheel', event => event.stopPropagation(), { passive: true });
}

function initActiveTab(){
 const savedView = localStorage.getItem('opencodegosniffer.currentDetailView');
 if (savedView && VALID_VIEWS.has(savedView)) {
   currentView = savedView;
 }
 updateActiveTab();
}

document.getElementById('showSnifferPageBtn').addEventListener('click', () => setDashboardPage('sniffer'));
document.getElementById('showUsagePageBtn').addEventListener('click', () => setDashboardPage('usage'));
document.getElementById('refreshBtn').addEventListener('click', refresh);
document.getElementById('clearBtn').addEventListener('click', clearAll);
document.getElementById('showSummaryBtn').addEventListener('click', () => setCurrentView('summary'));
document.getElementById('showRequestBtn').addEventListener('click', () => setCurrentView('request'));
document.getElementById('showResponseBtn').addEventListener('click', () => setCurrentView('response'));
document.getElementById('copyVisibleBtn').addEventListener('click', copyVisible);
document.getElementById('loadOpenCodeQuotaBtn').addEventListener('click', () => {
 loadOpenCodeQuota().catch(err => document.getElementById('ocUsageStatus').textContent = String(err && err.stack ? err.stack : err));
});
document.getElementById('loadOpenCodeUsageDetailBtn').addEventListener('click', () => {
 loadOpenCodeUsageDetail().catch(err => document.getElementById('ocUsageStatus').textContent = String(err && err.stack ? err.stack : err));
});
document.getElementById('clearOpenCodeUsageConfigBtn').addEventListener('click', clearOpenCodeUsageConfig);
document.getElementById('closeModalBtn').addEventListener('click', closeValueModal);
document.getElementById('copyModalBtn').addEventListener('click', async () => {
 await navigator.clipboard.writeText(modalCurrentText || '');
});
document.getElementById('valueModal').addEventListener('click', event => {
 if (event.target === document.getElementById('valueModal')) {
   closeValueModal();
 }
});
document.getElementById('valueModal').addEventListener('wheel', event => {
 const modal = document.querySelector('.modal');
 if (modal && modal.contains(event.target)) {
   event.stopPropagation();
 } else {
   event.preventDefault();
 }
}, { passive: false });
document.addEventListener('keydown', event => {
 if (event.key === 'Escape') {
   closeValueModal();
 }
});

updateDashboardPage();
initActiveTab();
initOpenCodeUsageForm();
initShowFullStringsToggle();
stopWheelPropagationInsideModal();

refresh().catch(err => {
 document.getElementById('detail').textContent = String(err && err.stack ? err.stack : err);
});
setInterval(() => refresh().catch(console.error), 3000);
</script>
</body>
</html>`;
}

function normalizeBindHost(value: string | undefined): string {
   const host = (value ?? "127.0.0.1").trim();
   return host || "127.0.0.1";
}

function hostForUrl(host: string): string {
   return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function normalizeRemoteAddress(value: string | undefined): string | undefined {
   if (!value) return undefined;
   if (value.startsWith("::ffff:")) return value.slice("::ffff:".length);
   return value;
}

function isAddressAllowed(remoteAddress: string, rulesText: string): boolean {
   const rules = rulesText.split(",").map((part) => part.trim()).filter(Boolean);
   if (rules.length === 0) return false;
   return rules.some((rule) => matchesAddressRule(remoteAddress, rule));
}

function matchesAddressRule(remoteAddress: string, rule: string): boolean {
   const normalizedRule = normalizeRemoteAddress(rule) ?? rule;
   if (normalizedRule === "*" || normalizedRule.toLowerCase() === "any") return true;
   if (normalizedRule.includes("*")) return matchesWildcardIpv4(remoteAddress, normalizedRule);
   if (normalizedRule.includes("/")) return matchesIpv4Network(remoteAddress, normalizedRule);
   return remoteAddress === normalizedRule;
}

function matchesWildcardIpv4(remoteAddress: string, rule: string): boolean {
   const ipParts = parseIpv4(remoteAddress);
   if (!ipParts) return false;
   const ruleParts = rule.split(".");
   if (ruleParts.length !== 4) return false;
   return ruleParts.every((part, index) => {
       if (part === "*") return true;
       const value = Number(part);
       return Number.isInteger(value) && value >= 0 && value <= 255 && value === ipParts[index];
   });
}

function matchesIpv4Network(remoteAddress: string, rule: string): boolean {
   const [networkText, maskText] = rule.split("/", 2);
   const ip = ipv4ToNumber(remoteAddress);
   const network = ipv4ToNumber(networkText);
   if (ip === undefined || network === undefined || maskText === undefined) return false;

   const mask = parseIpv4Mask(maskText);
   if (mask === undefined) return false;
   return (ip & mask) === (network & mask);
}

function parseIpv4Mask(maskText: string): number | undefined {
   if (/^\d{1,2}$/.test(maskText)) {
       const bits = Number(maskText);
       if (!Number.isInteger(bits) || bits < 0 || bits > 32) return undefined;
       return bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
   }
   return ipv4ToNumber(maskText);
}

function ipv4ToNumber(value: string): number | undefined {
   const parts = parseIpv4(value);
   if (!parts) return undefined;
   return (((parts[0] << 24) >>> 0) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function parseIpv4(value: string): [number, number, number, number] | undefined {
   const parts = value.split(".");
   if (parts.length !== 4) return undefined;
   const numbers = parts.map((part) => Number(part));
   if (!numbers.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) return undefined;
   return numbers as [number, number, number, number];
}


function getFirstLanIpv4Address(): string | undefined {
   const interfaces = os.networkInterfaces();
   for (const entries of Object.values(interfaces)) {
       for (const entry of entries ?? []) {
           if (entry.family === "IPv4" && !entry.internal) {
               return entry.address;
           }
       }
   }
   return undefined;
}
