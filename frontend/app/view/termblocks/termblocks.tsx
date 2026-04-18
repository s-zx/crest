// Copyright 2026, s-zx
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { cn } from "@/util/util";
import * as jotai from "jotai";
import * as React from "react";
import { useAtomValue } from "jotai";
import "./termblocks.scss";

const PollIntervalMs = 1500;

export class TermBlocksViewModel implements ViewModel {
    viewType: string;
    blockId: string;

    viewIcon = jotai.atom<string>("list");
    viewName = jotai.atom<string>("Blocks");
    noPadding = jotai.atom<boolean>(true);

    blocksAtom: jotai.PrimitiveAtom<CmdBlock[]>;
    loadingAtom: jotai.PrimitiveAtom<boolean>;
    errorAtom: jotai.PrimitiveAtom<string>;

    disposed = false;
    pollTimer: ReturnType<typeof setInterval> | null = null;

    constructor({ blockId }: ViewModelInitType) {
        this.viewType = "termblocks";
        this.blockId = blockId;
        this.blocksAtom = jotai.atom<CmdBlock[]>([]) as jotai.PrimitiveAtom<CmdBlock[]>;
        this.loadingAtom = jotai.atom<boolean>(true);
        this.errorAtom = jotai.atom<string>("") as jotai.PrimitiveAtom<string>;

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

    async fetchBlocks() {
        try {
            const rows = await RpcApi.GetCmdBlocksCommand(TabRpcClient, {
                blockid: this.blockId,
            });
            if (this.disposed) {
                return;
            }
            globalStore.set(this.blocksAtom, rows ?? []);
            globalStore.set(this.errorAtom, "");
            globalStore.set(this.loadingAtom, false);
        } catch (e) {
            if (this.disposed) {
                return;
            }
            globalStore.set(this.errorAtom, String(e));
            globalStore.set(this.loadingAtom, false);
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

const TermBlockRow: React.FC<{ block: CmdBlock }> = ({ block }) => {
    const isDone = block.state === "done";
    const isError = isDone && block.exitcode != null && block.exitcode !== 0;

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
                <TermBlockRow key={cb.oid} block={cb} />
            ))}
        </div>
    );
};
TermBlocksView.displayName = "TermBlocksView";
