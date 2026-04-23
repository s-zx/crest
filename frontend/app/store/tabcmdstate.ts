// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { waveEventSubscribeSingle } from "@/app/store/wps";
import * as jotai from "jotai";

export class TabCmdStateStore {
    private static instance: TabCmdStateStore | null = null;
    private unsubscribe: (() => void) | null = null;

    blockCmdStateAtom: jotai.PrimitiveAtom<Map<string, CmdBlock>>;

    private constructor() {
        this.blockCmdStateAtom = jotai.atom(new Map<string, CmdBlock>()) as jotai.PrimitiveAtom<
            Map<string, CmdBlock>
        >;
    }

    static getInstance(): TabCmdStateStore {
        if (!TabCmdStateStore.instance) {
            TabCmdStateStore.instance = new TabCmdStateStore();
        }
        return TabCmdStateStore.instance;
    }

    ensureSubscribed(): void {
        if (this.unsubscribe) return;
        this.unsubscribe = waveEventSubscribeSingle({
            eventType: "cmdblock:row",
            handler: (ev) => {
                const row = ev.data as CmdBlock | undefined;
                if (!row?.blockid) return;
                const current = globalStore.get(this.blockCmdStateAtom);
                const next = new Map(current);
                next.set(row.blockid, row);
                globalStore.set(this.blockCmdStateAtom, next);
            },
        });
    }
}

export function tabHasRunningCmd(blockIds: string[], map: Map<string, CmdBlock>): boolean {
    for (const bid of blockIds) {
        if (map.get(bid)?.state === "running") return true;
    }
    return false;
}

export type AgentKind = "claude" | "codex" | "ai" | "generic";

const CLAUDE_BINS = new Set(["claude"]);
const CODEX_BINS = new Set(["codex"]);
const OTHER_AI_BINS = new Set(["aider", "opencode", "cursor", "llm", "fabric", "goose", "continue"]);

function detectAgentKind(cmd: string | undefined): AgentKind {
    if (!cmd) return "generic";
    const bin = (cmd.trim().split(/\s+/)[0].split("/").at(-1) ?? "").toLowerCase();
    if (CLAUDE_BINS.has(bin)) return "claude";
    if (CODEX_BINS.has(bin)) return "codex";
    if (OTHER_AI_BINS.has(bin)) return "ai";
    return "generic";
}

export function getTabRunningKind(blockIds: string[], map: Map<string, CmdBlock>): AgentKind | undefined {
    // Prefer the first block that's running; agent kind beats generic if both
    // are happening in the same tab.
    let generic: AgentKind | undefined;
    for (const bid of blockIds) {
        const row = map.get(bid);
        if (row?.state !== "running") continue;
        const k = detectAgentKind(row.cmd);
        if (k !== "generic") return k;
        generic = k;
    }
    return generic;
}
