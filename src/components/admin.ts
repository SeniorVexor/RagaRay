import { Markup } from 'telegraf';
import { BotContext, AdminStats } from '../types';
import { prisma } from '../prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// Load admin config
const adminConfig = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../config/admin.json'), 'utf-8')
);

const { messages, buttons, settings } = adminConfig;

// ==================== KEYBOARDS ====================

const adminMainKeyboard = () => Markup.inlineKeyboard([
    [
        Markup.button.callback(buttons.stats, 'admin_stats'),
        Markup.button.callback(buttons.users, 'admin_users')
    ],
    [
        Markup.button.callback(buttons.payments, 'admin_payments'),
        Markup.button.callback(buttons.plans, 'admin_plans')
    ],
    [
        Markup.button.callback(buttons.broadcast, 'admin_broadcast'),
        Markup.button.callback(buttons.settings, 'admin_settings')
    ],
    [Markup.button.callback(buttons.exit, 'exit_admin')]
]);

const adminBackKeyboard = (callback: string = 'back_admin') =>
    Markup.inlineKeyboard([[Markup.button.callback(buttons.back, callback)]]);

const adminPaymentActions = (paymentId: number) => Markup.inlineKeyboard([
    [
        Markup.button.callback(buttons.approve, `approve_pay_${paymentId}`),
        Markup.button.callback(buttons.reject, `reject_pay_${paymentId}`)
    ],
    [Markup.button.callback(buttons.back, 'admin_payments')]
]);

const adminRefreshKeyboard = (callback: string) =>
    Markup.inlineKeyboard([
        [Markup.button.callback(buttons.refresh, callback)],
        [Markup.button.callback(buttons.back, 'back_admin')]
    ]);

// ==================== HELPERS ====================

const generatePaymentNumber = (id: number): string => {
    return id.toString().padStart(5, '0');
};

const isAdmin = async (ctx: BotContext): Promise<boolean> => {
    const user = await prisma.user.findUnique({
        where: { telegramId: ctx.from!.id.toString() }
    });
    return user?.isAdmin || ctx.from!.id.toString() === process.env.ADMIN_ID;
};

const getStats = async (): Promise<AdminStats> => {
    const [totalUsers, totalPayments, pendingPayments, totalPurchases, totalBalance] = await Promise.all([
        prisma.user.count(),
        prisma.payment.count(),
        prisma.payment.count({ where: { status: 'pending' } }),
        prisma.purchase.count(),
        prisma.user.aggregate({ _sum: { balance: true } })
    ]);

    return {
        totalUsers,
        totalPayments,
        pendingPayments,
        totalPurchases,
        totalBalance: totalBalance._sum.balance || 0
    };
};

const formatStats = (stats: AdminStats): string =>
    `${messages.statsTitle}:\n\n` +
    `👥 تعداد کاربران: ${stats.totalUsers}\n` +
    `💳 کل پرداخت‌ها: ${stats.totalPayments}\n` +
    `⏳ پرداخت‌های در انتظار: ${stats.pendingPayments}\n` +
    `🛒 کل خریدها: ${stats.totalPurchases}\n` +
    `💰 مجموع موجودی کاربران: ${stats.totalBalance.toLocaleString()} تومان`;

const formatUser = (user: any, index: number): string =>
    `${index + 1}. ${user.firstName || 'N/A'} (@${user.username || 'N/A'})\n` +
    `   🆔: ${user.telegramId} | 💰: ${user.balance.toLocaleString()}\n` +
    `   📅: ${user.createdAt.toLocaleDateString('')}`;

const formatPayment = (payment: any): string =>
    `🆔 #${payment.id} | 👤 ${payment.user.telegramId}\n` +
    `💰 ${payment.amount.toLocaleString()} | 🏦 ${payment.method}\n` +
    `📅 ${payment.createdAt.toLocaleDateString('')}`;

// ==================== HANDLERS ====================

export const enterAdminPanel = async (ctx: BotContext) => {
    if (!(await isAdmin(ctx))) {
        await ctx.reply('❌ شما دسترسی ندارید!');
        return false;
    }

    ctx.session.adminMode = true;
    ctx.session.adminState = null;

    if (ctx.callbackQuery) {
        await ctx.editMessageText(messages.welcome, adminMainKeyboard());
        await ctx.answerCbQuery('🔐 وارد پنل ادمین شدید');
    } else {
        await ctx.reply(messages.welcome, adminMainKeyboard());
    }
    return true;
};

const exitAdmin = async (ctx: BotContext, mainMenuText: string, mainKeyboard: any) => {
    ctx.session.adminMode = false;
    ctx.session.adminState = null;

    await ctx.editMessageText(mainMenuText, mainKeyboard);
    await ctx.answerCbQuery('خروج از ادمین');
};

const showStats = async (ctx: BotContext) => {
    const stats = await getStats();
    await ctx.editMessageText(
        formatStats(stats),
        adminRefreshKeyboard('admin_stats')
    );
    await ctx.answerCbQuery();
};

const showUsers = async (ctx: BotContext) => {
    const users = await prisma.user.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' }
    });

    const text = users.length > 0
        ? `${messages.usersTitle}:\n\n${users.map(formatUser).join('\n\n')}`
        : '👥 هیچ کاربری یافت نشد.';

    await ctx.editMessageText(text, adminBackKeyboard());
    await ctx.answerCbQuery();
};

// ==================== PAYMENT MANAGEMENT ====================

const showPayments = async (ctx: BotContext) => {
    const payments = await prisma.payment.findMany({
        where: { status: 'pending' },
        include: { user: true },
        take: 10,
        orderBy: { createdAt: 'desc' }
    });

    if (payments.length === 0) {
        await ctx.editMessageText(
            '✅ هیچ پرداخت در انتظاری وجود ندارد.',
            Markup.inlineKeyboard([
                [Markup.button.callback('🔙 بازگشت', 'back_admin')]
            ])
        );
        return await ctx.answerCbQuery();
    }

    let text = `⏳ <b>پرداخت‌های در انتظار (${payments.length})</b>\n\n`;

    const paymentButtons = payments.map(p => {
        const paymentNumber = generatePaymentNumber(p.id);
        const methodEmoji = p.method === 'card' ? '💳' : '🪙';

        text += `${methodEmoji} <code>#${paymentNumber}</code> | ${p.method === 'card' ? 'کارت' : 'کریپتو'}\n`;
        text += `👤 ${p.user.telegramId} | ${p.amount.toLocaleString('')} تومان\n\n`;

        return [
            Markup.button.callback(
                `${methodEmoji} #${paymentNumber} - ${p.amount.toLocaleString('')}`,
                `manage_payment_${p.id}`
            )
        ];
    });

    paymentButtons.push([Markup.button.callback('🔙 بازگشت', 'back_admin')]);

    await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(paymentButtons) });
    await ctx.answerCbQuery();
};

const managePayment = async (ctx: BotContext, paymentId: number) => {
    const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: { user: true }
    });

    if (!payment) {
        await ctx.answerCbQuery('❌ پرداخت یافت نشد!');
        return;
    }

    const paymentNumber = generatePaymentNumber(payment.id);
    const methodEmoji = payment.method === 'card' ? '💳' : '🪙';
    const methodName = payment.method === 'card' ? 'کارت به کارت' : 'کریپتو (USDT)';

    let text = `${methodEmoji} <b>پرداخت #${paymentNumber}</b>\n\n`;
    text += `🆔 شماره: <code>#${paymentNumber}</code>\n`;
    text += `👤 کاربر: <code>${payment.user.telegramId}</code>\n`;
    text += `👤 نام: ${payment.user.firstName || '—'}\n`;
    text += `💰 مبلغ: <b>${payment.amount.toLocaleString('')} ${payment.method === 'card' ? 'تومان' : 'USDT'}</b>\n`;
    text += `🏦 روش: ${methodName}\n`;
    text += `📅 تاریخ: ${payment.createdAt.toLocaleDateString('')}\n`;
    text += `⏳ وضعیت: <b>در انتظار</b>\n\n`;

    if (payment.method === 'card') {
        text += `👤 به نام: ${process.env.PAYMENT_CARD_NUMBER_OWNER || '—'}`;
    } else {
        text += `🔗 TX Hash:\n<code>${payment.receipt || '—'}</code>`;
    }

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('✅ تایید', `approve_pay_${paymentId}`),
            Markup.button.callback('❌ رد', `reject_pay_${paymentId}`)
        ],
        [Markup.button.callback('🔙 بازگشت به لیست', 'admin_payments')]
    ]);

    if (payment.receipt && payment.method === 'card') {
        await ctx.replyWithPhoto(payment.receipt, {
            caption: text,
            parse_mode: 'HTML',
            ...keyboard
        });
    } else {
        await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
    }

    await ctx.answerCbQuery();
};

const approvePayment = async (ctx: BotContext, paymentId: number) => {
    const payment = await prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'approved' },
        include: { user: true }
    });

    await prisma.user.update({
        where: { id: payment.userId },
        data: { balance: { increment: payment.amount } }
    });

    const paymentNumber = generatePaymentNumber(payment.id);

    // اطلاع به کاربر
    await ctx.telegram.sendMessage(
        payment.user.telegramId,
        `✅ <b>پرداخت شما تایید شد!</b>\n\n` +
        `🆔 شماره: <code>#${paymentNumber}</code>\n` +
        `💰 مبلغ: ${payment.amount.toLocaleString('')} ${payment.method === 'card' ? 'تومان' : 'USDT'}\n` +
        `💳 موجودی جدید: ${(payment.user.balance + payment.amount).toLocaleString('')} تومان\n\n` +
        `🎉 از اعتماد شما سپاسگزاریم.`,
        { parse_mode: 'HTML' }
    );

    // 🆕 به جای editMessageText، try-catch بذار
    try {
        await ctx.editMessageText(
            `✅ <b>پرداخت تایید شد</b>\n\n` +
            `🆔 شماره: <code>#${paymentNumber}</code>\n` +
            `👤 کاربر: ${payment.user.telegramId}\n` +
            `💰 مبلغ: ${payment.amount.toLocaleString('')} ${payment.method === 'card' ? 'تومان' : 'USDT'}`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 بازگشت به لیست', 'admin_payments')]
                ])
            }
        );
    } catch (error: any) {
        // اگه نتونست edit کنه (مثلاً پیام عکس بود)، یه پیام جدید بفرست
        if (error.description?.includes('no text in the message')) {
            await ctx.reply(
                `✅ <b>پرداخت تایید شد</b>\n\n` +
                `🆔 شماره: <code>#${paymentNumber}</code>\n` +
                `👤 کاربر: ${payment.user.telegramId}\n` +
                `💰 مبلغ: ${payment.amount.toLocaleString('')} ${payment.method === 'card' ? 'تومان' : 'USDT'}`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🔙 بازگشت به لیست', 'admin_payments')]
                    ])
                }
            );
        } else {
            throw error;
        }
    }

    await ctx.answerCbQuery('✅ تایید شد!');
};

const rejectPayment = async (ctx: BotContext, paymentId: number) => {
    const payment = await prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'rejected' },
        include: { user: true }
    });

    const paymentNumber = generatePaymentNumber(payment.id);

    // اطلاع به کاربر
    await ctx.telegram.sendMessage(
        payment.user.telegramId,
        `❌ <b>پرداخت شما رد شد</b>\n\n` +
        `🆔 شماره: <code>#${paymentNumber}</code>\n` +
        `💰 مبلغ: ${payment.amount.toLocaleString('')} ${payment.method === 'card' ? 'تومان' : 'USDT'}\n\n` +
        `📞 لطفاً با پشتیبانی تماس بگیرید:\n` +
        `@${process.env.PAYMENT_CARD_NUMBER_OWNER || 'support'}`,
        { parse_mode: 'HTML' }
    );

    // 🆕 به جای editMessageText، try-catch بذار
    try {
        await ctx.editMessageText(
            `❌ <b>پرداخت رد شد</b>\n\n` +
            `🆔 شماره: <code>#${paymentNumber}</code>\n` +
            `👤 کاربر: ${payment.user.telegramId}\n` +
            `💰 مبلغ: ${payment.amount.toLocaleString('')} ${payment.method === 'card' ? 'تومان' : 'USDT'}`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 بازگشت به لیست', 'admin_payments')]
                ])
            }
        );
    } catch (error: any) {
        // اگه نتونست edit کنه (مثلاً پیام عکس بود)، یه پیام جدید بفرست
        if (error.description?.includes('no text in the message')) {
            await ctx.reply(
                `❌ <b>پرداخت رد شد</b>\n\n` +
                `🆔 شماره: <code>#${paymentNumber}</code>\n` +
                `👤 کاربر: ${payment.user.telegramId}\n` +
                `💰 مبلغ: ${payment.amount.toLocaleString('')} ${payment.method === 'card' ? 'تومان' : 'USDT'}`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🔙 بازگشت به لیست', 'admin_payments')]
                    ])
                }
            );
        } else {
            throw error;
        }
    }

    await ctx.answerCbQuery('❌ رد شد!');
};

const startBroadcast = async (ctx: BotContext) => {
    ctx.session.adminState = 'broadcast';
    await ctx.editMessageText(
        messages.broadcastPrompt,
        Markup.inlineKeyboard([[Markup.button.callback(buttons.cancel, 'back_admin')]])
    );
    await ctx.answerCbQuery();
};

const handleBroadcast = async (ctx: BotContext): Promise<boolean> => {
    // FIX: Check if session exists and adminState is 'broadcast'
    if (!ctx.session || ctx.session.adminState !== 'broadcast') return false;

    const users = await prisma.user.findMany();
    let success = 0;
    let failed = 0;

    const statusMsg = await ctx.reply(messages.broadcastSending);

    for (const user of users) {
        try {
            await ctx.copyMessage(user.telegramId);
            success++;
        } catch (e) {
            failed++;
        }

        if (success % 20 === 0) await new Promise(r => setTimeout(r, 1000));
    }

    ctx.session.adminState = null;

    await ctx.telegram.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        undefined,
        messages.broadcastDone
            .replace('{success}', success.toString())
            .replace('{failed}', failed.toString()),
        adminBackKeyboard()
    );

    return true;
};

const showSettings = async (ctx: BotContext) => {
    let text = '⚙️ تنظیمات فعلی:\n\n';

    settings.items.forEach((item: any) => {
        const value = process.env[item.env] || 'تنظیم نشده';
        text += `${item.label}: <code>${value}</code>\n`;
    });

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...adminBackKeyboard()
    });
    await ctx.answerCbQuery();
};

const showPlans = async (ctx: BotContext) => {
    await ctx.editMessageText(
        '📦 مدیریت پلن‌ها:\n\n' +
        'در حال حاضر فقط از طریق فایل JSON امکان‌پذیر است.\n\n' +
        'فایل: src/config/plans.json',
        adminBackKeyboard()
    );
    await ctx.answerCbQuery();
};

// ==================== SETUP ====================

export const setupAdmin = (bot: any, mainMenuText: string, mainKeyboard: any) => {
    // Admin command
    bot.command('admin', async (ctx: BotContext) => {
        // FIX: Initialize session if not exists
        if (!ctx.session) ctx.session = {};
        await enterAdminPanel(ctx);
    });

    // Exit admin
    bot.action('exit_admin', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await exitAdmin(ctx, mainMenuText, mainKeyboard);
    });

    // Back to admin main
    bot.action('back_admin', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await ctx.editMessageText(messages.welcome, adminMainKeyboard());
        await ctx.answerCbQuery();
    });

    // Stats
    bot.action('admin_stats', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await showStats(ctx);
    });

    // Users
    bot.action('admin_users', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await showUsers(ctx);
    });

    // Payments
    bot.action('admin_payments', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await showPayments(ctx);
    });

    // Manage single payment
    bot.action(/manage_payment_(\d+)/, async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        const paymentId = parseInt(ctx.match![1]);
        await managePayment(ctx, paymentId);
    });

    // Approve payment
    bot.action(/approve_pay_(\d+)/, async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        const paymentId = parseInt(ctx.match![1]);
        await approvePayment(ctx, paymentId);
    });

    // Reject payment
    bot.action(/reject_pay_(\d+)/, async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        const paymentId = parseInt(ctx.match![1]);
        await rejectPayment(ctx, paymentId);
    });

    // Broadcast
    bot.action('admin_broadcast', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await startBroadcast(ctx);
    });

    // Plans
    bot.action('admin_plans', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await showPlans(ctx);
    });

    // Settings
    bot.action('admin_settings', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await showSettings(ctx);
    });

    bot.action('admin_inventory', async (ctx: BotContext) => {
        if (!ctx.session?.adminMode) return;

        const { getInventoryStatus } = await import('../utils/subManager');

        await ctx.editMessageText(
            getInventoryStatus(),
            Markup.inlineKeyboard([
                [Markup.button.callback('🔄 بروزرسانی', 'admin_inventory')],
                [Markup.button.callback('🔙 بازگشت', 'back_admin')]
            ])
        );
        await ctx.answerCbQuery();
    });

    // Handle broadcast message - FIX: Check session before access
    bot.on('message', async (ctx: BotContext, next: () => void) => {
        // FIX: Initialize session if undefined
        if (!ctx.session) ctx.session = {};

        const handled = await handleBroadcast(ctx);
        if (!handled) return next();
    });


};