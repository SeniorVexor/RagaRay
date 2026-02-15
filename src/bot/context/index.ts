// src/bot/context.ts

import { Scenes, Context as TelegrafContext } from "telegraf";

// --- ۱. ساختار Attack Scene State (مرکزی) ---
export interface attackState {
    targets: number[];
    currentIndex: number;
    selectedTargetId?: number;
    selectedGuardians: Record<string, number>;
    selectedGuardianToAdd?: string;
}

// --- ۲. ساختار Base Scene Session Data ---
export interface MySceneSession {
    __scene: any;
    buildingType?: string;
    mainMsgId?: number;
    attackState?: attackState;
    panelOwnerId?: number; // ID of the user who opened the panel
}

// --- ۳. Base Bot Context (Context عمومی بات) ---
export interface BotContext extends TelegrafContext {
    match: any;
    session?: MySceneSession;
    // scene: Scenes.SceneContextScene<any>;
}