import { Markup } from 'telegraf';

// Main User Keyboard
export const mainKeyboard = Markup.keyboard([
    ['📋 My Plans'],
    ['💰 Afzayesh Mojodi', '📦 Plans'],
    ['🆘 Support', '❓ Soalat Tekrari'],
    ['👥 Reffrall', '🔧 Server Test']
]).resize();

// Admin Keyboard
export const adminKeyboard = Markup.keyboard([
    ['📊 Stats', '👥 Users'],
    ['💳 Pending Payments', '📦 Manage Plans'],
    ['📢 Broadcast', '⚙️ Settings'],
    ['🔙 Back to User Mode']
]).resize();

// Payment Methods Keyboard
export const paymentMethodsKeyboard = Markup.keyboard([
    ['💳 Cart be Cart'],
    ['🏦 Dargah Pardakht'],
    ['⭐ Star Telegram'],
    ['🪙 Crypto (USDT)'],
    ['🔙 Back']
]).resize();

// Plans List Keyboard (Inline)
export const createPlansInlineKeyboard = (plans: any[]) => {
    const buttons = plans.map(plan => ([
        Markup.button.callback(
            `${plan.name} - ${plan.price.toLocaleString()} Toman`,
            `plan_${plan.id}`
        )
    ]));
    return Markup.inlineKeyboard(buttons);
};

// Admin Actions Keyboard
export const adminPaymentActions = (paymentId: number) => Markup.inlineKeyboard([
    [
        Markup.button.callback('✅ Taeed', `approve_pay_${paymentId}`),
        Markup.button.callback('❌ Rad', `reject_pay_${paymentId}`)
    ]
]);

// My Plans Inline Keyboard
export const myPlansInlineKeyboard = (purchases: any[]) => {
    const buttons = purchases.map(purchase => ([
        Markup.button.callback(
            `${purchase.plan.name} (${purchase.isActive ? '✅' : '❌'})`,
            `view_config_${purchase.id}`
        )
    ]));
    return Markup.inlineKeyboard(buttons);
};