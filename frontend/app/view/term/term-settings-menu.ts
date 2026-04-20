// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { modalsModel } from "@/app/store/modalmodel";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import {
    atoms,
    createBlock,
    createBlockSplitHorizontally,
    createBlockSplitVertically,
    getApi,
    getBlockMetaKeyAtom,
    getBlockTermDurableAtom,
    getSettingsKeyAtom,
    globalStore,
} from "@/store/global";
import * as WOS from "@/store/wos";
import { fireAndForget } from "@/util/util";

// Small heuristic borrowed from term-model: don't surface the File Browser
// item when the last command implies we're on a remote host.
function isLikelyOnSameHost(lastCommand: string | null | undefined): boolean {
    if (!lastCommand) return true;
    const trimmed = lastCommand.trim();
    if (trimmed.startsWith("ssh ") || trimmed.startsWith("ssh\t")) return false;
    if (trimmed.startsWith("mosh ") || trimmed.startsWith("mosh\t")) return false;
    return true;
}

export type TermSettingsMenuOpts = {
    blockId: string;
    // Optional hooks that only the full term view can satisfy.
    getScrollbackContent?: () => string | null;
    forceRestartController?: () => Promise<void> | void;
    restartSessionWithDurability?: (isDurable: boolean) => Promise<void> | void;
    lastCommand?: string | null;
};

export function buildTermSettingsMenuItems(opts: TermSettingsMenuOpts): ContextMenuItem[] {
    const { blockId, getScrollbackContent, forceRestartController, restartSessionWithDurability, lastCommand } = opts;

    const fullConfig = globalStore.get(atoms.fullConfigAtom);
    const termThemes = fullConfig?.termthemes ?? {};
    const termThemeKeys = Object.keys(termThemes);
    const curThemeName = globalStore.get(getBlockMetaKeyAtom(blockId, "term:theme"));
    const defaultFontSize = globalStore.get(getSettingsKeyAtom("term:fontsize")) ?? 12;
    const defaultAllowBracketedPaste = globalStore.get(getSettingsKeyAtom("term:allowbracketedpaste")) ?? true;
    const transparencyMeta = globalStore.get(getBlockMetaKeyAtom(blockId, "term:transparency"));
    const blockAtom = WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", blockId));
    const blockData = globalStore.get(blockAtom);
    const overrideFontSize = blockData?.meta?.["term:fontsize"];

    termThemeKeys.sort((a, b) => (termThemes[a]["display:order"] ?? 0) - (termThemes[b]["display:order"] ?? 0));

    const defaultTermBlockDef: BlockDef = {
        meta: { view: "term", controller: "shell" },
    };

    const setMeta = (meta: MetaType) =>
        RpcApi.SetMetaCommand(TabRpcClient, { oref: WOS.makeORef("block", blockId), meta });

    const fullMenu: ContextMenuItem[] = [];
    fullMenu.push({
        label: "Split Horizontally",
        click: () => {
            const bd = globalStore.get(blockAtom);
            const blockDef: BlockDef = { meta: bd?.meta || defaultTermBlockDef.meta };
            createBlockSplitHorizontally(blockDef, blockId, "after");
        },
    });
    fullMenu.push({
        label: "Split Vertically",
        click: () => {
            const bd = globalStore.get(blockAtom);
            const blockDef: BlockDef = { meta: bd?.meta || defaultTermBlockDef.meta };
            createBlockSplitVertically(blockDef, blockId, "after");
        },
    });
    fullMenu.push({ type: "separator" });

    const cwd = blockData?.meta?.["cmd:cwd"];
    const canShowFileBrowser = cwd != null && isLikelyOnSameHost(lastCommand);
    if (canShowFileBrowser) {
        fullMenu.push({
            label: "File Browser",
            click: () => {
                const bd = globalStore.get(blockAtom);
                const connection = bd?.meta?.connection;
                const cwdNow = bd?.meta?.["cmd:cwd"];
                const meta: Record<string, any> = { view: "preview", file: cwdNow };
                if (connection) meta.connection = connection;
                createBlock({ meta });
            },
        });
        fullMenu.push({ type: "separator" });
    }

    if (getScrollbackContent) {
        fullMenu.push({
            label: "Save Session As...",
            click: () => {
                const content = getScrollbackContent();
                if (!content) {
                    modalsModel.pushModal("MessageModal", {
                        children: "No scrollback content to save.",
                    });
                    return;
                }
                fireAndForget(async () => {
                    try {
                        const success = await getApi().saveTextFile("session.log", content);
                        if (!success) console.log("Save scrollback cancelled by user");
                    } catch (error) {
                        console.error("Failed to save scrollback:", error);
                        const errorMessage = error?.message || "An unknown error occurred";
                        modalsModel.pushModal("MessageModal", {
                            children: `Failed to save session scrollback: ${errorMessage}`,
                        });
                    }
                });
            },
        });
        fullMenu.push({ type: "separator" });
    }

    const themesSubmenu: ContextMenuItem[] = termThemeKeys.map((themeName) => ({
        label: termThemes[themeName]["display:name"] ?? themeName,
        type: "checkbox",
        checked: curThemeName == themeName,
        click: () => setMeta({ "term:theme": themeName }),
    }));
    themesSubmenu.unshift({
        label: "Default",
        type: "checkbox",
        checked: curThemeName == null,
        click: () => setMeta({ "term:theme": null }),
    });

    const fontSizeSubmenu: ContextMenuItem[] = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((fontSize) => ({
        label: fontSize.toString() + "px",
        type: "checkbox",
        checked: overrideFontSize == fontSize,
        click: () => setMeta({ "term:fontsize": fontSize }),
    }));
    fontSizeSubmenu.unshift({
        label: "Default (" + defaultFontSize + "px)",
        type: "checkbox",
        checked: overrideFontSize == null,
        click: () => setMeta({ "term:fontsize": null }),
    });

    const transparencySubmenu: ContextMenuItem[] = [
        {
            label: "Default",
            type: "checkbox",
            checked: transparencyMeta == null,
            click: () => setMeta({ "term:transparency": null }),
        },
        {
            label: "Transparent Background",
            type: "checkbox",
            checked: transparencyMeta == 0.5,
            click: () => setMeta({ "term:transparency": 0.5 }),
        },
        {
            label: "No Transparency",
            type: "checkbox",
            checked: transparencyMeta == 0,
            click: () => setMeta({ "term:transparency": 0 }),
        },
    ];

    fullMenu.push({ label: "Themes", submenu: themesSubmenu });
    fullMenu.push({ label: "Font Size", submenu: fontSizeSubmenu });
    fullMenu.push({ label: "Transparency", submenu: transparencySubmenu });
    fullMenu.push({ type: "separator" });

    const advancedSubmenu: ContextMenuItem[] = [];
    const allowBracketedPaste = blockData?.meta?.["term:allowbracketedpaste"];
    advancedSubmenu.push({
        label: "Allow Bracketed Paste Mode",
        submenu: [
            {
                label: "Default (" + (defaultAllowBracketedPaste ? "On" : "Off") + ")",
                type: "checkbox",
                checked: allowBracketedPaste == null,
                click: () => setMeta({ "term:allowbracketedpaste": null }),
            },
            {
                label: "On",
                type: "checkbox",
                checked: allowBracketedPaste === true,
                click: () => setMeta({ "term:allowbracketedpaste": true }),
            },
            {
                label: "Off",
                type: "checkbox",
                checked: allowBracketedPaste === false,
                click: () => setMeta({ "term:allowbracketedpaste": false }),
            },
        ],
    });
    if (forceRestartController) {
        advancedSubmenu.push({
            label: "Force Restart Controller",
            click: () => fireAndForget(async () => forceRestartController()),
        });
    }
    const isClearOnStart = blockData?.meta?.["cmd:clearonstart"];
    advancedSubmenu.push({
        label: "Clear Output On Restart",
        submenu: [
            {
                label: "On",
                type: "checkbox",
                checked: isClearOnStart,
                click: () => setMeta({ "cmd:clearonstart": true }),
            },
            {
                label: "Off",
                type: "checkbox",
                checked: !isClearOnStart,
                click: () => setMeta({ "cmd:clearonstart": false }),
            },
        ],
    });
    const runOnStart = blockData?.meta?.["cmd:runonstart"];
    advancedSubmenu.push({
        label: "Run On Startup",
        submenu: [
            {
                label: "On",
                type: "checkbox",
                checked: runOnStart,
                click: () => setMeta({ "cmd:runonstart": true }),
            },
            {
                label: "Off",
                type: "checkbox",
                checked: !runOnStart,
                click: () => setMeta({ "cmd:runonstart": false }),
            },
        ],
    });
    const debugConn = blockData?.meta?.["term:conndebug"];
    advancedSubmenu.push({
        label: "Debug Connection",
        submenu: [
            {
                label: "Off",
                type: "checkbox",
                checked: !debugConn,
                click: () => setMeta({ "term:conndebug": null }),
            },
            {
                label: "Info",
                type: "checkbox",
                checked: debugConn == "info",
                click: () => setMeta({ "term:conndebug": "info" }),
            },
            {
                label: "Verbose",
                type: "checkbox",
                checked: debugConn == "debug",
                click: () => setMeta({ "term:conndebug": "debug" }),
            },
        ],
    });
    if (restartSessionWithDurability) {
        const isDurable = globalStore.get(getBlockTermDurableAtom(blockId));
        if (isDurable) {
            advancedSubmenu.push({
                label: "Session Durability",
                submenu: [
                    {
                        label: "Restart Session in Standard Mode",
                        click: () => fireAndForget(async () => restartSessionWithDurability(false)),
                    },
                ],
            });
        } else if (isDurable === false) {
            advancedSubmenu.push({
                label: "Session Durability",
                submenu: [
                    {
                        label: "Restart Session in Durable Mode",
                        click: () => fireAndForget(async () => restartSessionWithDurability(true)),
                    },
                ],
            });
        }
    }
    fullMenu.push({ label: "Advanced", submenu: advancedSubmenu });

    if (blockData?.meta?.["term:vdomtoolbarblockid"]) {
        fullMenu.push({ type: "separator" });
        fullMenu.push({
            label: "Close Toolbar",
            click: () => {
                RpcApi.DeleteSubBlockCommand(TabRpcClient, {
                    blockid: blockData.meta["term:vdomtoolbarblockid"] as string,
                });
            },
        });
    }

    return fullMenu;
}
