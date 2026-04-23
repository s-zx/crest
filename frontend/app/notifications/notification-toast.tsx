// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { atoms } from "@/store/global";
import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import { memo, useEffect, useRef, useState } from "react";
import * as ReactDOM from "react-dom";
import { AppNotification, NotificationsModel } from "./notifications-model";
import { ToastModel } from "./toast-model";

const ToastAutoDismissMs = 6000;
const ToastExitMs = 150;

function timeAgoShort(ts: number): string {
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
}

const ToastCard = memo(({ note, onDismiss }: { note: AppNotification; onDismiss: (id: string) => void }) => {
    const [visible, setVisible] = useState(false);
    const [exiting, setExiting] = useState(false);
    const hoverRef = useRef(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const dismiss = () => {
        if (exiting) return;
        setExiting(true);
        setTimeout(() => onDismiss(note.id), ToastExitMs);
    };

    const scheduleAuto = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            if (!hoverRef.current) dismiss();
        }, ToastAutoDismissMs);
    };

    useEffect(() => {
        const raf = requestAnimationFrame(() => setVisible(true));
        scheduleAuto();
        return () => {
            cancelAnimationFrame(raf);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    return (
        <div
            className={cn(
                "relative w-[300px] flex items-start gap-3 px-3 py-3",
                "rounded-lg border border-white/10 shadow-2xl cursor-pointer select-none",
                "bg-[rgba(31,33,31,0.92)] backdrop-blur-xl",
                "transition-all",
                visible && !exiting ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"
            )}
            style={{ transitionDuration: exiting ? `${ToastExitMs}ms` : "200ms" }}
            onMouseEnter={() => {
                hoverRef.current = true;
                if (timerRef.current) clearTimeout(timerRef.current);
            }}
            onMouseLeave={() => {
                hoverRef.current = false;
                scheduleAuto();
            }}
            onClick={() => {
                NotificationsModel.getInstance().focusBlock(note.blockId, note.tabId);
                dismiss();
            }}
        >
            <div className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-[#c0634a]">
                <i className="fa-solid fa-asterisk text-white text-[13px]" aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                    {note.title && (
                        <span className="text-[11px] text-secondary truncate">{note.title}</span>
                    )}
                    <span className="text-[10px] text-secondary/60 shrink-0 ml-auto">{timeAgoShort(note.ts)}</span>
                </div>
                <div className="text-[12px] font-semibold text-primary leading-tight line-clamp-2">
                    {note.body}
                </div>
            </div>
            <button
                type="button"
                className="shrink-0 self-start text-secondary/40 hover:text-secondary cursor-pointer transition-colors"
                onClick={(e) => {
                    e.stopPropagation();
                    dismiss();
                }}
                aria-label="Dismiss"
            >
                <i className="fa-solid fa-xmark text-[11px]" aria-hidden />
            </button>
        </div>
    );
});
ToastCard.displayName = "ToastCard";

export const NotificationToastStacker = memo(() => {
    const model = ToastModel.getInstance();
    const toasts = useAtomValue(model.toastsAtom);
    const activeTabId = useAtomValue(atoms.staticTabId);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());

    const handleDismiss = (id: string) => {
        setDismissed((prev) => new Set([...prev, id]));
        setTimeout(() => model.remove(id), ToastExitMs + 50);
    };

    // Silently remove any toasts that belong to the tab the user is currently
    // viewing — they already saw the completion inline.  This is a fallback for
    // the handler-level skip that can miss due to event-delivery timing.
    useEffect(() => {
        const staleIds = toasts.filter((n) => n.tabId && n.tabId === activeTabId).map((n) => n.id);
        for (const id of staleIds) model.remove(id);
    }, [activeTabId, toasts]);

    // Prune dismissed IDs that no longer exist in the live toast feed so the
    // Set doesn't grow unbounded over a long session.
    useEffect(() => {
        if (dismissed.size === 0) return;
        const liveIds = new Set(toasts.map((t) => t.id));
        let changed = false;
        const next = new Set<string>();
        for (const id of dismissed) {
            if (liveIds.has(id)) {
                next.add(id);
            } else {
                changed = true;
            }
        }
        if (changed) setDismissed(next);
    }, [toasts]);

    const visible = toasts.filter((n) => !dismissed.has(n.id));
    if (visible.length === 0) return null;

    return ReactDOM.createPortal(
        <div className="pointer-events-none fixed top-[52px] right-3 z-[9999] flex flex-col gap-2 items-end">
            {visible.map((note) => (
                <div key={note.id} className="pointer-events-auto">
                    <ToastCard note={note} onDismiss={handleDismiss} />
                </div>
            ))}
        </div>,
        document.body
    );
});
NotificationToastStacker.displayName = "NotificationToastStacker";
