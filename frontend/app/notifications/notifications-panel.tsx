// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import { memo, useEffect } from "react";
import { AppNotification, NotificationsModel } from "./notifications-model";

const AUTO_MARK_READ_DELAY_MS = 1500;

function timeAgo(ts: number): string {
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
    const days = Math.floor(hrs / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
}

const NotificationRow = memo(({ n }: { n: AppNotification }) => {
    const model = NotificationsModel.getInstance();

    return (
        <div
            className={cn(
                "flex items-start gap-3 px-3 py-3 border-b border-white/5 cursor-pointer group",
                n.read ? "opacity-60" : "",
                "hover:bg-white/[0.04] transition-colors"
            )}
            onClick={() => {
                model.markRead(n.id);
                model.focusBlock(n.blockId, n.tabId);
            }}
        >
            <div className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-[#c0634a]">
                <i className="fa-solid fa-asterisk text-white text-[13px]" aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-0.5">
                    {n.title ? (
                        <span className="text-[11px] text-secondary truncate">{n.title}</span>
                    ) : (
                        <span />
                    )}
                    <span className="text-[10px] text-secondary/60 shrink-0">{timeAgo(n.ts)}</span>
                </div>
                <div className="text-[12px] font-semibold text-primary leading-tight line-clamp-2 break-all">
                    {n.body}
                </div>
            </div>
        </div>
    );
});
NotificationRow.displayName = "NotificationRow";

export const NotificationsPanel = memo(() => {
    const model = NotificationsModel.getInstance();
    const notifications = useAtomValue(model.notificationsAtom);
    const unread = useAtomValue(model.unreadCountAtom);

    useEffect(() => {
        model.ensureSubscribed();
    }, []);

    useEffect(() => {
        if (unread <= 0) return;
        const t = setTimeout(() => model.markAllRead(), AUTO_MARK_READ_DELAY_MS);
        return () => clearTimeout(t);
    }, [unread]);

    return (
        <div
            className={cn(
                "flex flex-col w-[340px] max-h-[480px] rounded-lg shadow-2xl overflow-hidden",
                "bg-[rgba(31,33,31,0.95)] backdrop-blur-xl border border-white/10"
            )}
        >
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10 shrink-0">
                <span className="text-[13px] font-semibold text-primary">Notifications</span>
                {notifications.length > 0 && (
                    <button
                        type="button"
                        onClick={() => model.markAllRead()}
                        className="text-[11px] text-secondary hover:text-primary cursor-pointer transition-colors"
                    >
                        Mark all as read
                    </button>
                )}
            </div>
            {notifications.length > 0 && (
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 shrink-0 bg-white/[0.02]">
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-primary/90 rounded px-2 py-0.5 bg-white/10">
                        All tabs ({notifications.length})
                    </span>
                    <button
                        type="button"
                        onClick={() => model.clearAll()}
                        className="text-[11px] text-secondary hover:text-primary cursor-pointer transition-colors"
                    >
                        Clear all
                    </button>
                </div>
            )}
            <div className="flex-1 overflow-y-auto">
                {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2 text-secondary text-[12px]">
                        <i className="fa fa-solid fa-bell text-[24px] opacity-30" />
                        <span>No notifications yet</span>
                        <span className="text-[11px] opacity-60">Terminal completions will appear here</span>
                    </div>
                ) : (
                    notifications.map((n) => <NotificationRow key={n.id} n={n} />)
                )}
            </div>
        </div>
    );
});
NotificationsPanel.displayName = "NotificationsPanel";
