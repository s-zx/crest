// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { refocusNode } from "@/app/store/global";
import type { AgentKind } from "@/app/store/tabcmdstate";
import { validateCssColor } from "@/util/color-validator";
import { cn } from "@/util/util";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { TabBadges } from "./tabbadges";

const RenameFocusDelayMs = 50;
const LeftFadeGradient = "linear-gradient(to right, transparent 0, black 18px)";

function isPathLike(s: string): boolean {
    return s.includes("/") || s.startsWith("~");
}

// PathText: a single line that left-anchors its text while it fits, and
// scrolls the end into view with a left-edge gradient fade once the content
// would overflow.  We avoid `direction: rtl` — for paths like
// "~/Documents/..." it triggers Unicode bidi reordering (the leading `~` is a
// weak char and can migrate to the end of the visual run).  Instead we keep
// LTR layout and push scrollLeft to the far right when overflowing.
interface PathTextProps {
    text: string;
    className?: string;
    title?: string;
}
const PathText: React.FC<PathTextProps> = ({ text, className, title }) => {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const apply = () => {
            const overflows = el.scrollWidth > el.clientWidth + 1;
            if (overflows) {
                el.scrollLeft = el.scrollWidth - el.clientWidth;
                el.style.setProperty("mask-image", LeftFadeGradient);
                el.style.setProperty("-webkit-mask-image", LeftFadeGradient);
            } else {
                el.scrollLeft = 0;
                el.style.removeProperty("mask-image");
                el.style.removeProperty("-webkit-mask-image");
            }
        };
        apply();
        const ro = new ResizeObserver(apply);
        ro.observe(el);
        return () => ro.disconnect();
    }, [text]);
    return (
        <div
            ref={ref}
            className={cn("overflow-hidden whitespace-nowrap scrollbar-none", className)}
            style={{ overflowX: "scroll", scrollbarWidth: "none" }}
            title={title}
        >
            {text}
        </div>
    );
};
PathText.displayName = "PathText";

export interface VTabItem {
    id: string;
    name: string;
    badge?: Badge | null;
    badges?: Badge[] | null;
    flagColor?: string | null;
    subtitle?: string;
    gitBranch?: string;
    gitAdds?: number;
    gitDels?: number;
    gitChangedFiles?: number;
    runningKind?: AgentKind;
}

interface VTabProps {
    tab: VTabItem;
    active: boolean;
    showDivider?: boolean;
    isDragging: boolean;
    isReordering: boolean;
    hoverResetVersion?: number;
    onSelect: () => void;
    onClose?: () => void;
    onRename?: (newName: string) => void;
    onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
    onMoreButtonClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
    onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
    onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
    onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
    onDragEnd: () => void;
    onHoverChanged?: (isHovered: boolean) => void;
    renameRef?: React.RefObject<(() => void) | null>;
}

// Visual treatment per detected agent kind.  Color scheme mirrors each
// vendor's brand so the indicator is recognizable at a glance.
const AgentIconStyles: Record<AgentKind, { icon: string; color: string; title: string }> = {
    claude: { icon: "fa-asterisk", color: "#c0634a", title: "Claude Code running" },
    codex:  { icon: "fa-code",     color: "#10a37f", title: "Codex running" },
    ai:     { icon: "fa-wand-magic-sparkles", color: "var(--color-accent)", title: "AI agent running" },
    generic:{ icon: "fa-circle-notch", color: "var(--color-secondary)", title: "Command running" },
};

function ActivityIcon({ kind }: { kind: AgentKind }) {
    const style = AgentIconStyles[kind];
    const spin = kind === "generic";
    return (
        <span
            className={cn(
                "relative flex items-center justify-center mr-2 shrink-0 w-[16px] h-[16px]",
                kind !== "generic" && "animate-pulse"
            )}
            title={style.title}
            aria-label={style.title}
        >
            <i
                className={cn("fa-solid", style.icon, spin && "fa-spin", "text-[12px]")}
                style={{ color: style.color }}
                aria-hidden
            />
        </span>
    );
}

export function VTab({
    tab,
    active,
    showDivider = true,
    isDragging,
    isReordering,
    hoverResetVersion,
    onSelect,
    onClose,
    onRename,
    onContextMenu,
    onMoreButtonClick,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    onHoverChanged,
    renameRef,
}: VTabProps) {
    const [originalName, setOriginalName] = useState(tab.name);
    const [isEditable, setIsEditable] = useState(false);
    const editableRef = useRef<HTMLDivElement>(null);
    const editableTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const badges = tab.badges ?? (tab.badge ? [tab.badge] : null);

    const rawFlagColor = tab.flagColor;
    let flagColor: string | null = null;
    if (rawFlagColor) {
        try {
            validateCssColor(rawFlagColor);
            flagColor = rawFlagColor;
        } catch {
            flagColor = null;
        }
    }

    useEffect(() => {
        setOriginalName(tab.name);
    }, [tab.name]);

    useEffect(() => {
        return () => {
            if (editableTimeoutRef.current) {
                clearTimeout(editableTimeoutRef.current);
            }
        };
    }, []);

    // When the tab bar bumps hoverResetVersion (e.g. after a drag), notify the
    // parent that hover is clear so stale "hovered" state tied to this row
    // doesn't linger. Purely-CSS :hover self-corrects on the next mousemove.
    useEffect(() => {
        onHoverChanged?.(false);
    }, [hoverResetVersion]);

    const selectEditableText = useCallback(() => {
        if (!editableRef.current) {
            return;
        }
        editableRef.current.focus();
        const range = document.createRange();
        const selection = window.getSelection();
        if (!selection) {
            return;
        }
        range.selectNodeContents(editableRef.current);
        selection.removeAllRanges();
        selection.addRange(range);
    }, []);

    const startRename = useCallback(() => {
        if (onRename == null || isReordering) {
            return;
        }
        if (editableTimeoutRef.current) {
            clearTimeout(editableTimeoutRef.current);
        }
        setIsEditable(true);
        editableTimeoutRef.current = setTimeout(() => {
            selectEditableText();
        }, RenameFocusDelayMs);
    }, [isReordering, onRename, selectEditableText]);

    if (renameRef != null) {
        renameRef.current = startRename;
    }

    const handleBlur = () => {
        if (!editableRef.current) {
            return;
        }
        const newText = editableRef.current.textContent?.trim() || originalName;
        editableRef.current.textContent = newText;
        setIsEditable(false);
        if (newText !== originalName) {
            onRename?.(newText);
        }
        setTimeout(() => refocusNode(null), 10);
    };

    const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
        if (!editableRef.current) {
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            editableRef.current.blur();
            return;
        }
        if (event.key !== "Escape") {
            return;
        }
        editableRef.current.textContent = originalName;
        editableRef.current.blur();
        event.preventDefault();
        event.stopPropagation();
    };

    const applyRtlToName = isPathLike(tab.name);

    return (
        <div
            draggable
            data-tabid={tab.id}
            onClick={onSelect}
            onDoubleClick={(event) => {
                event.stopPropagation();
                startRename();
            }}
            onContextMenu={onContextMenu}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            onMouseEnter={() => onHoverChanged?.(true)}
            onMouseLeave={() => onHoverChanged?.(false)}
            className={cn(
                "group relative flex w-full shrink-0 cursor-pointer items-center pl-3 text-[13px] transition-colors select-none",
                "whitespace-nowrap min-h-[60px]",
                active ? "text-primary" : isReordering ? "text-secondary" : "text-secondary hover:text-primary",
                isDragging && "opacity-50"
            )}
        >
            {active && (
                <div
                    className={cn(
                        "pointer-events-none absolute inset-x-[6px] inset-y-[5px] rounded-[5px]",
                        "border border-white/25",
                        "bg-white/[0.06]"
                    )}
                />
            )}
            {!active && !isReordering && (
                <div className="pointer-events-none absolute inset-x-[6px] inset-y-[5px] rounded-[5px] bg-transparent transition-colors group-hover:bg-white/[0.05]" />
            )}
            {flagColor && (
                <div
                    className="pointer-events-none absolute top-[5px] bottom-[5px] left-[2px] w-[3px] rounded-l-[5px]"
                    style={{ backgroundColor: flagColor }}
                    aria-hidden
                />
            )}
            <div
                className={cn(
                    "pointer-events-none absolute bottom-0 left-[5%] right-[5%] h-px bg-border/70",
                    !showDivider && "opacity-0"
                )}
            />
            {tab.runningKind ? (
                <ActivityIcon kind={tab.runningKind} />
            ) : (
                <TabBadges
                    badges={badges}
                    flagColor={flagColor}
                    className="mr-2 min-w-[16px] shrink-0 static top-auto left-auto z-auto h-[16px] w-auto translate-y-0 justify-start px-[2px] py-[1px] [&_i]:text-[10px]"
                />
            )}
            <div className="min-w-0 flex-1 flex flex-col justify-center pr-3 gap-[3px]">
                {isEditable || !applyRtlToName ? (
                    <div
                        ref={editableRef}
                        className={cn(
                            "overflow-hidden whitespace-nowrap leading-tight text-ellipsis",
                            isEditable && "rounded-[2px] bg-white/15 outline-none px-[3px]"
                        )}
                        contentEditable={isEditable}
                        role="textbox"
                        aria-label="Tab name"
                        aria-readonly={!isEditable}
                        onBlur={handleBlur}
                        onKeyDown={handleKeyDown}
                        suppressContentEditableWarning={true}
                    >
                        {tab.name}
                    </div>
                ) : (
                    <PathText text={tab.name} className="leading-tight" title={tab.name} />
                )}
                {/*
                  Metadata row always renders with a reserved 14px min-height
                  so the tab shape is constant whether or not cwd / branch
                  / diff info is available. Prevents twitch when data trickles
                  in after the click/switch.
                */}
                <div className="flex items-center gap-[6px] text-[11px] text-secondary/80 overflow-hidden whitespace-nowrap min-h-[14px] leading-tight">
                    {tab.subtitle ? (
                        <PathText text={tab.subtitle} className="min-w-0 flex-1" title={tab.subtitle} />
                    ) : null}
                    {tab.gitBranch && (
                        <span className="inline-flex items-center gap-[4px] shrink-0 text-[#b8f2c0]">
                            <i className="fa-solid fa-code-branch text-[10px] opacity-85" aria-hidden />
                            {tab.gitBranch}
                        </span>
                    )}
                    {tab.gitChangedFiles != null && tab.gitChangedFiles > 0 && (
                        <span className="shrink-0">
                            {tab.gitAdds != null && tab.gitAdds > 0 && (
                                <span className="text-[#4caf50]">+{tab.gitAdds}</span>
                            )}
                            {tab.gitDels != null && tab.gitDels > 0 && (
                                <span className="text-[#e57373] ml-[3px]">-{tab.gitDels}</span>
                            )}
                        </span>
                    )}
                </div>
            </div>
            {onClose && (
                <div
                    className={cn(
                        "absolute top-[10px] right-[8px] flex items-center gap-[1px] h-[22px] p-[2px]",
                        "rounded-[4px] bg-[rgba(232,233,230,0.96)] shadow-[0_1px_2px_rgba(0,0,0,0.18)]",
                        "transition-opacity duration-100",
                        isReordering
                            ? "opacity-0 pointer-events-none"
                            : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
                    )}
                >
                    {(onContextMenu || onMoreButtonClick) && (
                        <button
                            type="button"
                            className="cursor-pointer w-[20px] h-full flex items-center justify-center text-[#2a2a2a] rounded-[4px] hover:bg-[rgba(100,102,98,0.45)] transition-colors"
                            onClick={(event) => {
                                event.stopPropagation();
                                if (onMoreButtonClick) {
                                    onMoreButtonClick(event);
                                } else {
                                    onContextMenu!(event as unknown as React.MouseEvent<HTMLDivElement>);
                                }
                            }}
                            aria-label="Tab options"
                            title="Tab options"
                        >
                            <i className="fa fa-solid fa-ellipsis-vertical text-[11px]" />
                        </button>
                    )}
                    <button
                        type="button"
                        className="cursor-pointer w-[20px] h-full flex items-center justify-center text-[#2a2a2a] rounded-[4px] hover:bg-[rgba(100,102,98,0.45)] transition-colors"
                        onClick={(event) => {
                            event.stopPropagation();
                            onClose();
                        }}
                        aria-label="Close tab"
                        title="Close tab"
                    >
                        <i className="fa fa-solid fa-xmark text-[11px]" />
                    </button>
                </div>
            )}
        </div>
    );
}
