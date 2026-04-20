// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { WorkspaceLayoutModel } from "@/app/workspace/workspace-layout-model";
import { cn, fireAndForget } from "@/util/util";
import { getApi } from "@/store/global";
import { useAtomValue } from "jotai";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { bundledLanguages, codeToHtml } from "shiki/bundle/web";
import { DiffLine, FileStats, GitChangedFile, GitModel } from "./git-model";

const ShikiTheme = "github-dark-high-contrast";

// ---- Extension → Shiki language mapping ----
const ExtToShikiLang: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    mjs: "javascript",
    cjs: "javascript",
    go: "go",
    rs: "rust",
    py: "python",
    rb: "ruby",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    yml: "yaml",
    yaml: "yaml",
    json: "json",
    toml: "toml",
    xml: "xml",
    html: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    md: "markdown",
    sql: "sql",
    vue: "vue",
    svelte: "svelte",
    lua: "lua",
    dart: "dart",
    proto: "proto",
    r: "r",
    scala: "scala",
    hs: "haskell",
    ex: "elixir",
    exs: "elixir",
};

function resolveShikiLang(path: string): string | null {
    const name = path.split("/").pop()?.toLowerCase() ?? "";
    if (name === "dockerfile") return "dockerfile" in bundledLanguages ? "dockerfile" : null;
    if (name === "makefile") return "makefile" in bundledLanguages ? "makefile" : null;
    const ext = name.includes(".") ? name.split(".").pop()! : "";
    const lang = ExtToShikiLang[ext];
    return lang && lang in bundledLanguages ? lang : null;
}

// ---- Icon button (shared header/action affordance) ----
const IconButton = memo(
    ({
        icon,
        onClick,
        title,
        danger,
    }: {
        icon: string;
        onClick: (e: React.MouseEvent) => void;
        title?: string;
        danger?: boolean;
    }) => (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={cn(
                "flex items-center justify-center w-6 h-6 rounded-sm text-[11px] text-secondary/70 hover:bg-white/[0.06] transition-colors cursor-pointer",
                danger ? "hover:text-rose-400" : "hover:text-primary"
            )}
        >
            <i className={cn("fa fa-solid", icon)} />
        </button>
    )
);
IconButton.displayName = "IconButton";

// ---- Stat badge: `+494 · -0` (pill, dark bg, skeleton while loading) ----
const StatBadge = memo(({ add, del, loading }: { add: number; del: number; loading?: boolean }) => {
    if (loading) {
        return <span className="w-[72px] h-[20px] rounded-sm bg-white/[0.06] animate-pulse shrink-0" />;
    }
    return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-black/40 border border-white/[0.05] text-[11px] font-mono tabular-nums shrink-0">
            <span className="text-emerald-400">+{add}</span>
            <span className="text-secondary/35">·</span>
            <span className="text-rose-400">-{del}</span>
        </span>
    );
});
StatBadge.displayName = "StatBadge";

// ---- Format a file's diff as plain text for clipboard / context ----
function formatDiffForClipboard(path: string, diff?: DiffLine[]): string {
    const header = `--- ${path} ---`;
    if (!diff || diff.length === 0) return `${header}\n(no diff available)`;
    const lines: string[] = [header];
    for (const line of diff) {
        if (line.type === "add") lines.push("+" + line.content);
        else if (line.type === "remove") lines.push("-" + line.content);
        else if (line.type === "context") lines.push(" " + line.content);
        else lines.push(line.content);
    }
    return lines.join("\n");
}

// ---- Compute per-line old/new numbers by walking hunk headers ----
type NumberedLine = { line: DiffLine; oldNum?: number; newNum?: number };

function numberDiffLines(diff: DiffLine[]): NumberedLine[] {
    const out: NumberedLine[] = [];
    let oldNum = 0;
    let newNum = 0;
    const hunkRe = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
    for (const line of diff) {
        if (line.type === "hunk") {
            const m = hunkRe.exec(line.content);
            if (m) {
                oldNum = parseInt(m[1], 10);
                newNum = parseInt(m[2], 10);
            }
            out.push({ line });
            continue;
        }
        if (line.type === "header") {
            out.push({ line });
            continue;
        }
        if (line.type === "add") {
            out.push({ line, newNum });
            newNum++;
        } else if (line.type === "remove") {
            out.push({ line, oldNum });
            oldNum++;
        } else {
            out.push({ line, oldNum, newNum });
            oldNum++;
            newNum++;
        }
    }
    return out;
}

// ---- Single diff line ----
const DiffLineRow = memo(({ item, highlighted }: { item: NumberedLine; highlighted?: string }) => {
    const { line, oldNum, newNum } = item;
    if (line.type === "header") return null;
    if (line.type === "hunk") {
        return (
            <div className="px-3 py-1 text-[10px] font-mono text-sky-300/70 bg-sky-400/[0.04] border-y border-white/[0.05]">
                {line.content}
            </div>
        );
    }
    const isAdd = line.type === "add";
    const isDel = line.type === "remove";
    const codeClass = cn(
        "whitespace-pre-wrap break-all flex-1 pr-3",
        isAdd && "text-emerald-100",
        isDel && "text-rose-100",
        !isAdd && !isDel && "text-primary/75"
    );
    return (
        <div
            className={cn(
                "flex text-[11px] font-mono leading-[18px] relative",
                isAdd && "bg-emerald-400/[0.06]",
                isDel && "bg-rose-400/[0.06]"
            )}
        >
            {(isAdd || isDel) && (
                <span
                    className={cn(
                        "absolute left-0 top-0 bottom-0 w-[2px]",
                        isAdd ? "bg-emerald-400" : "bg-rose-400"
                    )}
                />
            )}
            <span className="w-9 pl-2 pr-1 text-right text-[10px] text-secondary/40 tabular-nums select-none shrink-0">
                {isAdd ? "" : oldNum ?? ""}
            </span>
            <span className="w-9 pr-2 text-right text-[10px] text-secondary/40 tabular-nums select-none shrink-0">
                {isDel ? "" : newNum ?? ""}
            </span>
            {highlighted ? (
                <span className={codeClass} dangerouslySetInnerHTML={{ __html: highlighted }} />
            ) : (
                <span className={codeClass}>{line.content}</span>
            )}
        </div>
    );
});
DiffLineRow.displayName = "DiffLineRow";

// ---- File block ----
type FileRowProps = {
    file: GitChangedFile;
    expanded: boolean;
    loading: boolean;
    stats?: FileStats;
    diff?: DiffLine[];
};

const FileRow = memo(({ file, expanded, loading, stats, diff }: FileRowProps) => {
    const model = GitModel.getInstance();
    const parts = file.path.split("/");
    const name = parts.pop() ?? file.path;
    const dirPath = parts.join("/");

    const numbered = useMemo(() => (diff ? numberDiffLines(diff) : []), [diff]);

    // Shiki highlighting — tokenize code lines together, then map back to diff indexes
    const [highlightedLines, setHighlightedLines] = useState<string[]>([]);
    const seqRef = useRef(0);

    useEffect(() => {
        if (!diff || diff.length === 0) {
            setHighlightedLines([]);
            return;
        }
        const lang = resolveShikiLang(file.path);
        if (!lang) {
            setHighlightedLines([]);
            return;
        }

        const codeLines: string[] = [];
        const codeIdxToDiffIdx: number[] = [];
        for (let i = 0; i < diff.length; i++) {
            const t = diff[i].type;
            if (t === "add" || t === "remove" || t === "context") {
                codeLines.push(diff[i].content);
                codeIdxToDiffIdx.push(i);
            }
        }
        if (codeLines.length === 0) {
            setHighlightedLines([]);
            return;
        }

        seqRef.current++;
        const seq = seqRef.current;
        let disposed = false;

        codeToHtml(codeLines.join("\n"), { lang, theme: ShikiTheme })
            .then((html) => {
                if (disposed || seq !== seqRef.current) return;
                const start = html.indexOf("<code");
                const open = html.indexOf(">", start);
                const end = html.lastIndexOf("</code>");
                if (start < 0 || open < 0 || end < 0) return;
                const inner = html.slice(open + 1, end);

                const tmp = document.createElement("div");
                tmp.innerHTML = inner;
                const lineHtml = Array.from(tmp.querySelectorAll("span.line")).map((el) => el.innerHTML);

                const full: string[] = new Array(diff.length).fill("");
                for (let i = 0; i < codeIdxToDiffIdx.length; i++) {
                    full[codeIdxToDiffIdx[i]] = lineHtml[i] ?? "";
                }
                setHighlightedLines(full);
            })
            .catch((e) => {
                if (disposed || seq !== seqRef.current) return;
                console.warn(`Shiki highlight failed for ${file.path}`, e);
            });

        return () => {
            disposed = true;
        };
    }, [diff, file.path]);

    return (
        <div
            className={cn(
                "mx-3 rounded-md border transition-colors overflow-hidden shrink-0",
                expanded
                    ? "border-white/[0.14] bg-white/[0.03]"
                    : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]"
            )}
        >
            {/* Header row */}
            <div
                className="flex items-center gap-1 h-10 pl-1.5 pr-2 cursor-pointer group"
                onClick={() => fireAndForget(() => model.toggleExpand(file.path))}
            >
                {/* Chevron with hover-bg (rounded square on row hover) */}
                <span className="w-6 h-6 flex items-center justify-center rounded-sm group-hover:bg-white/[0.07] transition-colors shrink-0">
                    <i
                        className={cn(
                            "fa fa-solid fa-chevron-right text-[10px] text-secondary/70 transition-transform duration-150",
                            expanded && "rotate-90"
                        )}
                    />
                </span>
                {/* Path: natural width when it fits, end-anchored with left fade when overflowing */}
                <span
                    className="min-w-0 text-[12px] whitespace-nowrap overflow-hidden ml-1"
                    title={file.path}
                    style={{
                        direction: "rtl",
                        maskImage: "linear-gradient(to right, transparent 0, black 18px, black 100%)",
                        WebkitMaskImage: "linear-gradient(to right, transparent 0, black 18px, black 100%)",
                    }}
                >
                    <bdi>
                        {dirPath && <span className="text-secondary/55">{dirPath}/</span>}
                        <span className="text-primary font-medium">{name}</span>
                    </bdi>
                </span>
                {/* Copy path — right next to filename, always visible */}
                <IconButton
                    icon="fa-copy"
                    title="Copy path"
                    onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(file.path);
                    }}
                />
                {/* Stat badge */}
                <StatBadge add={stats?.add ?? 0} del={stats?.del ?? 0} loading={loading && !stats} />
                {/* Action cluster — pushed to right edge via ml-auto */}
                <div className="flex items-center gap-0.5 ml-auto shrink-0">
                    <IconButton
                        icon="fa-paperclip"
                        title="Add file diff as context"
                        onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(formatDiffForClipboard(file.path, diff));
                        }}
                    />
                    <IconButton
                        icon="fa-reply"
                        title="Discard changes"
                        danger
                        onClick={(e) => {
                            e.stopPropagation();
                            const ok = window.confirm(
                                `Discard all uncommitted changes to\n\n  ${file.path}\n\nThis cannot be undone.`
                            );
                            if (!ok) return;
                            fireAndForget(() => model.discardFile(file.path));
                        }}
                    />
                    <IconButton
                        icon="fa-arrow-up-right-from-square"
                        title="Open file"
                        onClick={(e) => {
                            e.stopPropagation();
                            const cwd = globalStore_get_cwd();
                            if (cwd) getApi().openNativePath(`${cwd}/${file.path}`);
                        }}
                    />
                </div>
            </div>
            {/* Diff viewport */}
            {expanded && (
                <div className="border-t border-white/[0.06] bg-black/30 overflow-x-auto">
                    {loading && !diff ? (
                        <div className="px-3 py-2 text-[11px] text-secondary/60 italic">Loading diff…</div>
                    ) : numbered.length > 0 ? (
                        numbered.map((item, i) => (
                            <DiffLineRow key={i} item={item} highlighted={highlightedLines[i]} />
                        ))
                    ) : (
                        <div className="px-3 py-2 text-[11px] text-secondary/60 italic">No diff available</div>
                    )}
                </div>
            )}
        </div>
    );
});
FileRow.displayName = "FileRow";

// Helper: grab cwd from model
function globalStore_get_cwd(): string | null {
    try {
        return GitModel.getInstance()
            ? (document.querySelector("[data-git-cwd]") as HTMLElement | null)?.dataset?.gitCwd ?? null
            : null;
    } catch {
        return null;
    }
}

// ---- Skeleton file block (loading state) ----
const FileSkeleton = memo(() => (
    <div className="mx-3 h-10 rounded-lg border border-white/[0.06] bg-white/[0.02] animate-pulse" />
));
FileSkeleton.displayName = "FileSkeleton";

// ---- Code Review right sidebar ----
export const GitReviewSidebar = memo(() => {
    const model = GitModel.getInstance();
    const isRepo = useAtomValue(model.isRepoAtom);
    const branch = useAtomValue(model.branchAtom);
    const totalAdd = useAtomValue(model.totalAddAtom);
    const totalDel = useAtomValue(model.totalDelAtom);
    const files = useAtomValue(model.filesAtom);
    const expanded = useAtomValue(model.expandedFilesAtom);
    const diffs = useAtomValue(model.fileDiffsAtom);
    const fileStats = useAtomValue(model.fileStatsAtom);
    const loadingFiles = useAtomValue(model.loadingFilesAtom);
    const loading = useAtomValue(model.loadingAtom);
    const error = useAtomValue(model.errorAtom);

    useEffect(() => {
        model.syncCwd();
        fireAndForget(() => model.refresh());
        model.startAutoRefresh();
    }, []);

    const layoutModel = WorkspaceLayoutModel.getInstance();
    const isWide = useAtomValue(layoutModel.codeReviewWideAtom);

    return (
        <div className="flex flex-col h-full border-l border-white/[0.08] bg-black/20">
            {/* ---- Title bar ---- */}
            <div className="flex items-center justify-between h-10 px-3 border-b border-white/[0.06] shrink-0">
                <div className="flex items-center gap-2">
                    <i className="fa fa-solid fa-code-pull-request text-accent text-[12px]" />
                    <span className="text-[13px] font-semibold tracking-tight text-primary">Code review</span>
                </div>
                <div className="flex items-center gap-1">
                    <IconButton
                        icon={isWide ? "fa-compress" : "fa-expand"}
                        title={isWide ? "Collapse panel" : "Expand panel"}
                        onClick={() => globalStore.set(layoutModel.codeReviewWideAtom, !isWide)}
                    />
                    <IconButton
                        icon="fa-xmark"
                        title="Close"
                        onClick={() => layoutModel.setCodeReviewVisible(false)}
                    />
                </div>
            </div>

            {/* ---- Branch + totals (inline, no card) ---- */}
            {isRepo && (
                <div className="flex items-center gap-2 px-3 pt-2 pb-1 shrink-0">
                    <span className="text-[14px] font-semibold text-primary truncate">{branch || "—"}</span>
                    <i className="fa fa-solid fa-file text-secondary/50 text-[11px] shrink-0 ml-1" />
                    <span className="text-[12px] text-secondary/85 tabular-nums">{files.length}</span>
                    <span className="text-secondary/35 text-[11px]">·</span>
                    <span className="text-[12px] font-mono tabular-nums text-emerald-400">+{totalAdd}</span>
                    <span className="text-[12px] font-mono tabular-nums text-rose-400">-{totalDel}</span>
                </div>
            )}

            {/* ---- Filter + global actions ---- */}
            {isRepo && (
                <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2 shrink-0">
                    <button
                        type="button"
                        className="flex items-center gap-2 h-6 px-2 rounded-sm border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] text-[12px] text-primary/85 cursor-pointer transition-colors"
                    >
                        <span>Uncommitted changes</span>
                        <i className="fa fa-solid fa-chevron-down text-[9px] text-secondary/60" />
                    </button>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            disabled={files.length === 0}
                            onClick={() => {
                                const n = files.length;
                                const ok = window.confirm(
                                    `Discard all uncommitted changes across ${n} file${n === 1 ? "" : "s"}?\n\nThis cannot be undone.`
                                );
                                if (!ok) return;
                                fireAndForget(async () => {
                                    await Promise.all(files.map((f) => model.discardFile(f.path)));
                                });
                            }}
                            className="flex items-center gap-1.5 h-6 px-2 rounded-sm border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] text-[12px] text-secondary/85 hover:text-rose-400 cursor-pointer transition-colors disabled:opacity-40 disabled:hover:bg-white/[0.02] disabled:hover:text-secondary/85"
                            title="Discard all uncommitted changes"
                        >
                            <i className="fa fa-solid fa-reply text-[11px]" />
                            <span>Discard all</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (files.length === 0) return;
                                const all = files
                                    .map((f) => formatDiffForClipboard(f.path, diffs.get(f.path)))
                                    .join("\n\n");
                                navigator.clipboard.writeText(all);
                            }}
                            title="Add all diffs as context"
                            className="flex items-center justify-center h-6 w-6 rounded-sm border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] text-[11px] text-secondary/85 hover:text-primary cursor-pointer transition-colors"
                        >
                            <i className="fa fa-solid fa-paperclip" />
                        </button>
                    </div>
                </div>
            )}

            {/* ---- Body ---- */}
            {loading && files.length === 0 ? (
                <div className="flex flex-col gap-2 mt-3 shrink-0">
                    <FileSkeleton />
                    <FileSkeleton />
                    <FileSkeleton />
                </div>
            ) : error ? (
                <div className="flex-1 flex items-center justify-center p-8">
                    <div className="flex flex-col items-center gap-3 text-center">
                        <i className="fa fa-solid fa-triangle-exclamation text-[18px] text-rose-400/80" />
                        <span className="text-[12px] text-secondary/80 max-w-[240px]">{error}</span>
                    </div>
                </div>
            ) : !isRepo ? (
                <div className="flex-1 flex items-center justify-center p-8">
                    <div className="flex flex-col items-center gap-3 text-secondary/70">
                        <i className="fa fa-brands fa-git-alt text-[18px] opacity-70" />
                        <span className="text-[12px]">Not a git repository</span>
                    </div>
                </div>
            ) : files.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-8">
                    <div className="flex flex-col items-center gap-3 text-secondary/70">
                        <i className="fa fa-solid fa-check text-[18px] text-emerald-400/70" />
                        <span className="text-[12px]">Working tree clean</span>
                    </div>
                </div>
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto py-3 flex flex-col gap-2">
                    {files.map((file) => (
                        <FileRow
                            key={file.path}
                            file={file}
                            expanded={expanded.has(file.path)}
                            loading={loadingFiles.has(file.path)}
                            stats={fileStats.get(file.path)}
                            diff={diffs.get(file.path)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
});
GitReviewSidebar.displayName = "GitReviewSidebar";

// Keep old export for compat
export { GitReviewSidebar as GitReviewPanel };
