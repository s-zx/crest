// Copyright 2026, s-zx
// SPDX-License-Identifier: Apache-2.0

import * as WOS from "@/app/store/wos";
import { globalStore } from "@/app/store/jotaiStore";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { base64ToString, cn } from "@/util/util";
import * as jotai from "jotai";
import { useAtomValue } from "jotai";
import * as React from "react";
import "./termblocks.scss";

const PollIntervalMs = 1500;
const MaxRenderedBytesPerBlock = 256 * 1024;
const AnsiCsiRe = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const AnsiOscRe = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

function stripAnsi(s: string): string {
    return s.replace(AnsiOscRe, "").replace(AnsiCsiRe, "");
}

export class TermBlocksViewModel implements ViewModel {
    viewType: string;
    blockId: string;

    viewIcon = jotai.atom<string>("list");
    viewName = jotai.atom<string>("Blocks");
    noPadding = jotai.atom<boolean>(true);
    viewText: jotai.Atom<HeaderElem[]>;

    blocksAtom: jotai.PrimitiveAtom<CmdBlock[]>;
    outputCacheAtom: jotai.PrimitiveAtom<Record<string, string>>;
    loadingAtom: jotai.PrimitiveAtom<boolean>;
    errorAtom: jotai.PrimitiveAtom<string>;

    disposed = false;
    pollTimer: ReturnType<typeof setInterval> | null = null;

    constructor({ blockId }: ViewModelInitType) {
        this.viewType = "termblocks";
        this.blockId = blockId;
        this.blocksAtom = jotai.atom<CmdBlock[]>([]) as jotai.PrimitiveAtom<CmdBlock[]>;
        this.outputCacheAtom = jotai.atom<Record<string, string>>({}) as jotai.PrimitiveAtom<Record<string, string>>;
        this.loadingAtom = jotai.atom<boolean>(true);
        this.errorAtom = jotai.atom<string>("") as jotai.PrimitiveAtom<string>;

        this.viewText = jotai.atom<HeaderElem[]>([
            {
                elemtype: "textbutton",
                text: "Back to Terminal",
                className: "grey !py-[2px] !px-[10px] text-[11px] font-[500]",
                title: "Switch this block's view back to the standard terminal",
                onClick: () => this.switchToTerminal(),
            },
        ]);

        this.fetchBlocks();
        this.pollTimer = setInterval(() => {
            if (!this.disposed) {
                this.fetchBlocks();
            }
        }, PollIntervalMs);
    }

    get viewComponent(): ViewComponent {
        return TermBlocksView;
    }

    async switchToTerminal() {
        await RpcApi.SetMetaCommand(TabRpcClient, {
            oref: WOS.makeORef("block", this.blockId),
            meta: { view: "term" },
        });
    }

    async fetchBlocks() {
        try {
            const rows = await RpcApi.GetCmdBlocksCommand(TabRpcClient, {
                blockid: this.blockId,
            });
            if (this.disposed) {
                return;
            }
            const list = rows ?? [];
            globalStore.set(this.blocksAtom, list);
            globalStore.set(this.errorAtom, "");
            globalStore.set(this.loadingAtom, false);
            const cache = globalStore.get(this.outputCacheAtom);
            for (const b of list) {
                if (
                    b.state === "done" &&
                    b.outputstartoffset != null &&
                    b.outputendoffset != null &&
                    cache[b.oid] == null
                ) {
                    this.fetchOutputFor(b);
                }
            }
        } catch (e) {
            if (this.disposed) {
                return;
            }
            globalStore.set(this.errorAtom, String(e));
            globalStore.set(this.loadingAtom, false);
        }
    }

    async fetchOutputFor(block: CmdBlock) {
        if (block.outputstartoffset == null || block.outputendoffset == null) {
            return;
        }
        const rawSize = block.outputendoffset - block.outputstartoffset;
        if (rawSize <= 0) {
            const cache = { ...globalStore.get(this.outputCacheAtom), [block.oid]: "" };
            globalStore.set(this.outputCacheAtom, cache);
            return;
        }
        const size = Math.min(rawSize, MaxRenderedBytesPerBlock);
        try {
            const resp = await RpcApi.ReadBlockFileRangeCommand(TabRpcClient, {
                blockid: this.blockId,
                name: "term",
                offset: block.outputstartoffset,
                size,
            });
            if (this.disposed) {
                return;
            }
            let text = base64ToString(resp.data64);
            if (rawSize > MaxRenderedBytesPerBlock) {
                text += `\n\n[… truncated, ${rawSize - size} more bytes]`;
            }
            const cache = { ...globalStore.get(this.outputCacheAtom), [block.oid]: text };
            globalStore.set(this.outputCacheAtom, cache);
        } catch (e) {
            console.warn("termblocks: fetchOutputFor failed", block.oid, e);
        }
    }

    dispose() {
        this.disposed = true;
        if (this.pollTimer != null) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }
}

const TermBlockRow: React.FC<{ block: CmdBlock; output: string | undefined }> = ({ block, output }) => {
    const isDone = block.state === "done";
    const isError = isDone && block.exitcode != null && block.exitcode !== 0;
    const cleanedOutput = output != null ? stripAnsi(output).replace(/\r\n/g, "\n").replace(/\r/g, "\n") : null;
    const hasOutput = cleanedOutput != null && cleanedOutput.length > 0;

    return (
        <div className={cn("termblocks-row", `termblocks-row-${block.state}`, isError && "termblocks-row-error")}>
            <div className="termblocks-row-head">
                <span className="termblocks-seq">#{block.seq}</span>
                <span className="termblocks-state">{block.state}</span>
                {block.shelltype && <span className="termblocks-shell">{block.shelltype}</span>}
                {isDone && (
                    <span className={cn("termblocks-exit", isError && "is-error")}>exit {block.exitcode ?? "?"}</span>
                )}
                {block.durationms != null && <span className="termblocks-duration">{block.durationms}ms</span>}
            </div>
            <div className="termblocks-row-cmd">
                {block.cmd ? (
                    block.cmd
                ) : (
                    <em className="termblocks-placeholder">(waiting for command)</em>
                )}
            </div>
            {hasOutput && <pre className="termblocks-row-output">{cleanedOutput}</pre>}
            <div className="termblocks-row-offsets">
                prompt@{block.promptoffset}
                {block.cmdoffset != null && ` • cmd@${block.cmdoffset}`}
                {block.outputstartoffset != null &&
                    ` • out[${block.outputstartoffset}..${block.outputendoffset ?? "…"}]`}
            </div>
        </div>
    );
};
TermBlockRow.displayName = "TermBlockRow";

export const TermBlocksView: React.FC<ViewComponentProps<TermBlocksViewModel>> = ({ model }) => {
    const blocks = useAtomValue(model.blocksAtom);
    const outputs = useAtomValue(model.outputCacheAtom);
    const loading = useAtomValue(model.loadingAtom);
    const error = useAtomValue(model.errorAtom);

    if (error) {
        return <div className="termblocks-empty termblocks-error">Error: {error}</div>;
    }
    if (loading && blocks.length === 0) {
        return <div className="termblocks-empty">Loading…</div>;
    }
    if (blocks.length === 0) {
        return (
            <div className="termblocks-empty">
                No commands recorded yet on this block. Switch to Terminal view, run a command, then come back.
            </div>
        );
    }

    return (
        <div className="termblocks-container">
            <div className="termblocks-header">
                {blocks.length} command{blocks.length === 1 ? "" : "s"} · block {model.blockId.slice(0, 8)}
            </div>
            {blocks.map((cb) => (
                <TermBlockRow key={cb.oid} block={cb} output={outputs[cb.oid]} />
            ))}
        </div>
    );
};
TermBlocksView.displayName = "TermBlocksView";
