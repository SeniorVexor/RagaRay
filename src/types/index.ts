import { Context, Scenes } from 'telegraf';

// FAQ Types
export interface FAQItem {
    id: string;
    title: string;
    question: string;
    answer: string;
}

// Plan Types
export interface SelectedPlan {
    id: string;
    duration: {
        id: number;
        name: string;
        days: number;
        emoji: string;
    };
    traffic: number;
    price: number;
    connections: number;
    days: number;
    serviceUrl?: string;
    server?: any;
}

export interface PendingPayment {
    method: string;
    amount: number;
    currency: string;
}

// Session Types
export interface BotSession extends Scenes.SceneSession {
    adminMode?: boolean;
    pendingPayment?: PendingPayment;  // Update type
    selectedPlan?: SelectedPlan;
    pendingPlan?: SelectedPlan & { configName?: string };
    selectedDuration?: number;
    broadcastMode?: boolean;
    paymentMethod?: string;           // 'card' | 'crypto' | 'gateway' | 'stars'
    awaitingAmount?: boolean;
    awaitingReceipt?: boolean;
    awaitingConfigName?: boolean;
    // وضعیت‌های مختلف ویزارد ادمین (برودکست، تنظیمات، ویرایش یوزر/کانفیگ‌ها)
    adminState?:
        | 'broadcast'
        | 'edit_settings'
        | 'view_user'
        | 'edit_plans_json'
        | 'edit_subs_json'
        | 'edit_servers_json'
        | 'edit_user_balance'
        | `add_link_${string}_${string}`
        | null;
    selectedUserId?: number;
    selectedServer?: number;
    selectedService?: string;
}

// Context Type with match
export interface BotContext extends Scenes.SceneContext {
    session: BotSession;
    dbUser?: any;
    match?: RegExpExecArray | null;
}

// Admin Stats Type
export interface AdminStats {
    totalUsers: number;
    totalPayments: number;
    pendingPayments: number;
    totalPurchases: number;
    totalBalance: number;
}