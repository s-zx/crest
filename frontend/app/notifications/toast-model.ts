// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import * as jotai from "jotai";
import { AppNotification } from "./notifications-model";

const MaxVisibleToasts = 3;

export class ToastModel {
    private static instance: ToastModel | null = null;

    toastsAtom: jotai.PrimitiveAtom<AppNotification[]>;

    private constructor() {
        this.toastsAtom = jotai.atom<AppNotification[]>([]) as jotai.PrimitiveAtom<AppNotification[]>;
    }

    static getInstance(): ToastModel {
        if (!ToastModel.instance) {
            ToastModel.instance = new ToastModel();
        }
        return ToastModel.instance;
    }

    push(note: AppNotification): void {
        const current = globalStore.get(this.toastsAtom);
        // Oldest drop first when over the cap; newest pins to the top.
        const next = [note, ...current].slice(0, MaxVisibleToasts);
        globalStore.set(this.toastsAtom, next);
    }

    remove(id: string): void {
        const current = globalStore.get(this.toastsAtom);
        const next = current.filter((n) => n.id !== id);
        if (next.length !== current.length) {
            globalStore.set(this.toastsAtom, next);
        }
    }

    clear(): void {
        globalStore.set(this.toastsAtom, []);
    }
}
