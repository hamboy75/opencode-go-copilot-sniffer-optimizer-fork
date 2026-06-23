export type RequestPruningMode = "off" | "preview" | "enabled";

export interface RequestPruningRegexRule {
    path: string;
    pattern: string;
    flags?: string;
    replacement?: string;
}

export interface RequestPruningOptions {
    mode: RequestPruningMode;
    removePaths: string[];
    regexRules: RequestPruningRegexRule[];
}

export interface RequestPruningResult<T = unknown> {
    body: T;
    originalBody: T;
    mode: RequestPruningMode;
    enabled: boolean;
    removedPaths: string[];
    modifiedStrings: string[];
    originalBytes: number;
    prunedBytes: number;
    savedBytes: number;
}

type PathSegment =
    | { kind: "property"; name: string }
    | { kind: "arrayWildcard" };

export function pruneRequestBody<T>(body: T, options: RequestPruningOptions): RequestPruningResult<T> {
    const originalBody = deepClone(body);
    const workingBody = deepClone(body);

    const removedPaths: string[] = [];
    const modifiedStrings: string[] = [];

    if (options.mode !== "off") {
        for (const path of options.removePaths.map((p) => p.trim()).filter(Boolean)) {
            removeByPath(workingBody, parsePath(path), path, removedPaths);
        }

        for (const rule of options.regexRules) {
            applyRegexRule(workingBody, rule, modifiedStrings);
        }
    }

    const originalBytes = byteLengthStable(originalBody);
    const prunedBytes = byteLengthStable(workingBody);
    const savedBytes = Math.max(0, originalBytes - prunedBytes);

    return {
        body: (options.mode === "enabled" ? workingBody : originalBody) as T,
        originalBody: originalBody as T,
        mode: options.mode,
        enabled: options.mode === "enabled",
        removedPaths,
        modifiedStrings,
        originalBytes,
        prunedBytes,
        savedBytes,
    };
}

function deepClone<T>(value: T): T {
    if (value === undefined || value === null) {
        return value;
    }
    return JSON.parse(JSON.stringify(value)) as T;
}

function byteLengthStable(value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

function parsePath(path: string): PathSegment[] {
    return path
        .split(".")
        .map((part) => part.trim())
        .filter(Boolean)
        .flatMap((part): PathSegment[] => {
            if (part.endsWith("[]")) {
                const name = part.slice(0, -2);
                return name
                    ? [{ kind: "property", name }, { kind: "arrayWildcard" }]
                    : [{ kind: "arrayWildcard" }];
            }
            return [{ kind: "property", name: part }];
        });
}

function removeByPath(
    root: unknown,
    segments: PathSegment[],
    originalPath: string,
    removedPaths: string[],
    concretePath = ""
): void {
    if (segments.length === 0) {
        return;
    }

    const [segment, ...rest] = segments;

    if (segment.kind === "arrayWildcard") {
        if (!Array.isArray(root)) {
            return;
        }
        root.forEach((item, index) => {
            removeByPath(item, rest, originalPath, removedPaths, `${concretePath}[${index}]`);
        });
        return;
    }

    if (!isRecord(root)) {
        return;
    }

    if (!(segment.name in root)) {
        return;
    }

    const nextPath = concretePath ? `${concretePath}.${segment.name}` : segment.name;

    if (rest.length === 0) {
        delete root[segment.name];
        removedPaths.push(nextPath || originalPath);
        return;
    }

    removeByPath(root[segment.name], rest, originalPath, removedPaths, nextPath);
}

function applyRegexRule(root: unknown, rule: RequestPruningRegexRule, modifiedStrings: string[]): void {
    const path = rule.path.trim();
    if (!path || !rule.pattern) {
        return;
    }

    let regex: RegExp;
    try {
        regex = new RegExp(rule.pattern, normalizeRegexFlags(rule.flags));
    } catch {
        return;
    }

    const replacement = rule.replacement ?? "";
    applyRegexAtPath(root, parsePath(path), regex, replacement, modifiedStrings);
}

function normalizeRegexFlags(flags?: string): string {
    const raw = flags || "g";
    const allowed = new Set(["g", "i", "m", "s", "u"]);
    const normalized = Array.from(new Set(raw.split("").filter((flag) => allowed.has(flag)))).join("");
    return normalized.includes("g") ? normalized : `${normalized}g`;
}

function applyRegexAtPath(
    root: unknown,
    segments: PathSegment[],
    regex: RegExp,
    replacement: string,
    modifiedStrings: string[],
    concretePath = ""
): void {
    if (segments.length === 0) {
        return;
    }

    const [segment, ...rest] = segments;

    if (segment.kind === "arrayWildcard") {
        if (!Array.isArray(root)) {
            return;
        }
        root.forEach((item, index) => {
            applyRegexAtPath(item, rest, regex, replacement, modifiedStrings, `${concretePath}[${index}]`);
        });
        return;
    }

    if (!isRecord(root) || !(segment.name in root)) {
        return;
    }

    const nextPath = concretePath ? `${concretePath}.${segment.name}` : segment.name;

    if (rest.length === 0) {
        const current = root[segment.name];
        if (typeof current !== "string") {
            return;
        }
        regex.lastIndex = 0;
        const next = current.replace(regex, replacement);
        if (next !== current) {
            root[segment.name] = next;
            modifiedStrings.push(nextPath);
        }
        return;
    }

    applyRegexAtPath(root[segment.name], rest, regex, replacement, modifiedStrings, nextPath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function defaultPruningRemovePaths(): string[] {
    return [];
}

export function defaultPruningRegexRules(): RequestPruningRegexRule[] {
    return [
        {
            path: "messages[].content[].text",
            pattern: "<environment_info>[\\s\\S]*?<\\/environment_info>",
            flags: "g",
            replacement: "",
        },
        {
            path: "messages[].content[].text",
            pattern: "<workspace_info>[\\s\\S]*?<\\/workspace_info>",
            flags: "g",
            replacement: "",
        },
        {
            path: "messages[].content[].text",
            pattern: "<memoryGuide>[\\s\\S]*?<\\/memoryGuide>",
            flags: "g",
            replacement: "",
        },
        {
            path: "messages[].content[].text",
            pattern: "<skills>[\\s\\S]*?<\\/skills>",
            flags: "g",
            replacement: "",
        },
    ];
}
