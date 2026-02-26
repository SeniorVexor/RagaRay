// src/components/admin.ts
import { Markup } from 'telegraf';
import { BotContext } from '../types';
import { prisma } from '../prisma/client';
import { isAdminUser } from '../utils/adminAuth';
import { getInventoryStatus } from '../utils/subManager';

// ==================== TYPES ====================
interface DetailedStats {
    totalUsers: number;
    todayUsers: number;
    weekUsers: number;
    monthUsers: number;
    totalBalance: number;
    totalPurchases: number;
    todayPurchases: number;
    pendingPayments: number;
    totalLinks: number;
    todayRevenue: number;
    monthRevenue: number;
    cancelledPurchases: number;
    activeServers: number;
}

// ==================== KEYBOARDS ====================

// 🎨 Main Admin Keyboard - Modern & Beautiful
const adminMainKeyboard = () => Markup.inlineKeyboard([
    [
        Markup.button.callback('📊 آمار و گزارشات', 'admin_stats'),
        Markup.button.callback('👥 مدیریت کاربران', 'admin_users_menu')
    ],
    [
        Markup.button.callback('💳 پرداخت‌ها', 'admin_payments'),
        Markup.button.callback('📦 موجودی کانفیگ', 'admin_inventory')
    ],
    [
        Markup.button.callback('⚙️ مدیریت کانفیگ‌ها', 'admin_configs'),
        Markup.button.callback('📢 ارسال همگانی', 'admin_broadcast')
    ],
    [
        Markup.button.callback('🎁 کد هدیه', 'admin_giftcards'),
        Markup.button.callback('🏦 مدیریت مالی', 'admin_finance')
    ],
    [Markup.button.callback('🔴 خروج از پنل ادمین', 'exit_admin')]
]);

const adminBackKeyboard = () =>
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت به منو', 'back_admin')]]);

const adminRefreshKeyboard = (callback: string) =>
    Markup.inlineKeyboard([
        [Markup.button.callback('🔄 بروزرسانی', callback)],
        [Markup.button.callback('🔙 بازگشت', 'back_admin')]
    ]);

// ==================== HELPERS ====================

const generatePaymentNumber = (id: number): string => {
    return id.toString().padStart(5, '0');
};

const getDetailedStats = async (): Promise<DetailedStats> => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
        totalUsers,
        todayUsers,
        weekUsers,
        monthUsers,
        totalBalance,
        totalPurchases,
        todayPurchases,
        pendingPayments
    ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: today } } }),
        prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.user.count({ where: { createdAt: { gte: monthAgo } } }),
        prisma.user.aggregate({ _sum: { balance: true } }).then(r => r._sum.balance || 0),
        prisma.purchase.count(),
        prisma.purchase.count({ where: { createdAt: { gte: today } } }),
        prisma.payment.count({ where: { status: 'pending' } })
    ]);

    // Calculate revenue from approved payments
    const todayRevenue = await prisma.payment.aggregate({
        where: {
            status: 'approved',
            createdAt: { gte: today },
            method: 'card'
        },
        _sum: { amount: true }
    }).then(r => r._sum.amount || 0);

    const monthRevenue = await prisma.payment.aggregate({
        where: {
            status: 'approved',
            createdAt: { gte: monthAgo },
            method: 'card'
        },
        _sum: { amount: true }
    }).then(r => r._sum.amount || 0);

    return {
        totalUsers,
        todayUsers,
        weekUsers,
        monthUsers,
        totalBalance,
        totalPurchases,
        todayPurchases,
        pendingPayments,
        totalLinks: 0, // Will be calculated from subs.json
        todayRevenue,
        monthRevenue,
        cancelledPurchases: 0,
        activeServers: 3
    };
};

// ==================== MAIN MENU ====================

export const enterAdminPanel = async (ctx: BotContext) => {
    if (!isAdminUser(ctx)) {
        await ctx.reply('⛔ شما دسترسی ادمین ندارید!');
        return false;
    }

    if (!ctx.session) ctx.session = {};
    ctx.session.adminMode = true;
    ctx.session.adminState = null;

    const welcomeText =
        `🔐 <b>پنل مدیریت رگارِی</b>\n\n` +
        `👋 سلام ادمین عزیز\n` +
        `📅 ${new Date().toLocaleDateString('fa-IR')}\n\n` +
        `از منوی زیر بخش مورد نظر را انتخاب کنید:`;

    if (ctx.callbackQuery) {
        await ctx.editMessageText(welcomeText, {
            parse_mode: 'HTML',
            ...adminMainKeyboard()
        });
        await ctx.answerCbQuery('🔐 وارد پنل ادمین شدید');
    } else {
        await ctx.reply(welcomeText, {
            parse_mode: 'HTML',
            ...adminMainKeyboard()
        });
    }
    return true;
};

const exitAdmin = async (ctx: BotContext, mainMenuText: string, mainKeyboard: any) => {
    if (!ctx.session) ctx.session = {};
    ctx.session.adminMode = false;
    ctx.session.adminState = null;

    await ctx.editMessageText('✅ از پنل ادمین خارج شدید.', mainKeyboard);
    await ctx.answerCbQuery('خروج از ادمین');
};

// ==================== STATS SECTION ====================

const showEnhancedStats = async (ctx: BotContext) => {
    const stats = await getDetailedStats();

    let text = `📊 <b>داشبورد مدیریت</b>\n`;
    text += `━`.repeat(25) + `\n\n`;

    // Users Section
    text += `👥 <b>کاربران</b>\n`;
    text += `├ کل: ${stats.totalUsers.toLocaleString('fa-IR')} 👤\n`;
    text += `├ امروز: +${stats.todayUsers} 🆕\n`;
    text += `├ هفته: +${stats.weekUsers} 📈\n`;
    text += `└ ماه: +${stats.monthUsers} 🌟\n\n`;

    // Financial Section
    text += `💰 <b>مالی</b>\n`;
    text += `├ موجودی کل: ${stats.totalBalance.toLocaleString('fa-IR')} 💎\n`;
    text += `├ درآمد امروز: ${stats.todayRevenue.toLocaleString('fa-IR')} 💵\n`;
    text += `├ درآمد ماه: ${stats.monthRevenue.toLocaleString('fa-IR')} 💸\n`;
    text += `└ پرداخت‌های در انتظار: ${stats.pendingPayments} ⏳\n\n`;

    // Sales Section
    text += `🛒 <b>فروش</b>\n`;
    text += `├ کل خریدها: ${stats.totalPurchases} 🛍\n`;
    text += `├ امروز: ${stats.todayPurchases} ✅\n`;
    text += `└ لغو شده: ${stats.cancelledPurchases} ❌\n\n`;

    // Inventory
    text += `📦 <b>موجودی</b>\n`;
    text += `├ کل لینک‌ها: ${stats.totalLinks} 🔗\n`;
    text += `└ سرورهای فعال: ${stats.activeServers} 🌍\n`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('🔄 بروزرسانی', 'admin_stats'),
            Markup.button.callback('📈 نمودار', 'admin_charts')
        ],
        [
            Markup.button.callback('👥 لیست کاربران', 'admin_users'),
            Markup.button.callback('💳 پرداخت‌ها', 'admin_payments')
        ],
        [Markup.button.callback('🔙 بازگشت به منو', 'back_admin')]
    ]);

    await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
    await ctx.answerCbQuery();
};

// ==================== USERS SECTION ====================

const showUsersMenu = async (ctx: BotContext) => {
    const recentUsers = await prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            telegramId: true,
            username: true,
            firstName: true,
            balance: true,
            createdAt: true
        }
    });

    let text = `👥 <b>مدیریت کاربران</b>\n\n`;
    text += `🔍 آخرین کاربران:\n\n`;

    recentUsers.forEach((user, idx) => {
        const date = new Date(user.createdAt).toLocaleDateString('fa-IR');
        text += `${idx + 1}. ${user.firstName || 'Unknown'} `;
        text += user.username ? `(@${user.username}) ` : '';
        text += `\n   ├ ID: <code>${user.telegramId}</code>\n`;
        text += `   ├ موجودی: ${user.balance.toLocaleString('fa-IR')} 💎\n`;
        text += `   └ تاریخ: ${date}\n\n`;
    });

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('🔍 جستجو', 'admin_search_user'),
            Markup.button.callback('➕ افزودن موجودی', 'admin_add_balance')
        ],
        [
            Markup.button.callback('📋 لیست کامل', 'admin_all_users'),
            Markup.button.callback('🚫 مسدود کردن', 'admin_ban_user')
        ],
        [Markup.button.callback('🔙 بازگشت', 'back_admin')]
    ]);

    await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
    await ctx.answerCbQuery();
};

const showAllUsers = async (ctx: BotContext) => {
    const users = await prisma.user.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' }
    });

    let text = `📋 <b>لیست کاربران</b> (${users.length} مورد)\n\n`;

    users.forEach((user, index) => {
        text += `${index + 1}. ${user.firstName || 'N/A'} `;
        text += user.username ? `(@${user.username}) ` : '';
        text += `\n   🆔: <code>${user.telegramId}</code>\n`;
        text += `   💰: ${user.balance.toLocaleString('fa-IR')} تومان\n`;
        text += `   📅: ${user.createdAt.toLocaleDateString('fa-IR')}\n\n`;
    });

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...adminBackKeyboard()
    });
    await ctx.answerCbQuery();
};

// ==================== PAYMENTS SECTION ====================

const showPaymentsMenu = async (ctx: BotContext) => {
    const [pending, approved, rejected] = await Promise.all([
        prisma.payment.count({ where: { status: 'pending' } }),
        prisma.payment.count({
            where: {
                status: 'approved',
                createdAt: { gte: new Date(Date.now() - 24*60*60*1000) }
            }
        }),
        prisma.payment.count({
            where: {
                status: 'rejected',
                createdAt: { gte: new Date(Date.now() - 24*60*60*1000) }
            }
        })
    ]);

    let text = `💳 <b>مدیریت پرداخت‌ها</b>\n\n`;
    text += `📊 وضعیت ۲۴ ساعت اخیر:\n`;
    text += `├ ⏳ در انتظار: ${pending}\n`;
    text += `├ ✅ تایید شده: ${approved}\n`;
    text += `└ ❌ رد شده: ${rejected}\n\n`;

    if (pending > 0) {
        text += `⚠️ <b>${pending} پرداخت در انتظار تایید است!</b>`;
    } else {
        text += `✅ هیچ پرداخت در انتظاری وجود ندارد.`;
    }

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('⏳ مشاهده در انتظار', 'admin_pending_payments'),
            Markup.button.callback('📜 تاریخچه', 'admin_payment_history')
        ],
        [
            Markup.button.callback('✅ تایید سریع', 'admin_quick_approve'),
            Markup.button.callback('⚙️ تنظیمات درگاه', 'admin_payment_settings')
        ],
        [Markup.button.callback('🔙 بازگشت', 'back_admin')]
    ]);

    await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
    await ctx.answerCbQuery();
};

const showPendingPayments = async (ctx: BotContext) => {
    const payments = await prisma.payment.findMany({
        where: { status: 'pending' },
        include: { user: true },
        take: 10,
        orderBy: { createdAt: 'desc' }
    });

    if (payments.length === 0) {
        await ctx.editMessageText(
            '✅ هیچ پرداخت در انتظاری وجود ندارد.',
            adminBackKeyboard()
        );
        return await ctx.answerCbQuery();
    }

    let text = `⏳ <b>پرداخت‌های در انتظار (${payments.length})</b>\n\n`;

    const paymentButtons: any[] = [];

    payments.forEach(p => {
        const paymentNumber = generatePaymentNumber(p.id);
        const methodEmoji = p.method === 'card' ? '💳' : '🪙';

        text += `${methodEmoji} <code>#${paymentNumber}</code> | ${p.method === 'card' ? 'کارت' : 'کریپتو'}\n`;
        text += `👤 ${p.user.telegramId} | ${p.amount.toLocaleString('fa-IR')} تومان\n\n`;

        paymentButtons.push([
            Markup.button.callback(
                `${methodEmoji} #${paymentNumber} - ${p.amount.toLocaleString('fa-IR')}`,
                `manage_payment_${p.id}`
            )
        ]);
    });

    paymentButtons.push([Markup.button.callback('🔙 بازگشت', 'admin_payments')]);

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(paymentButtons)
    });
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
    text += `💰 مبلغ: <b>${payment.amount.toLocaleString('fa-IR')} ${payment.method === 'card' ? 'تومان' : 'USDT'}</b>\n`;
    text += `🏦 روش: ${methodName}\n`;
    text += `📅 تاریخ: ${payment.createdAt.toLocaleDateString('fa-IR')}\n`;
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
        [Markup.button.callback('🔙 بازگشت به لیست', 'admin_pending_payments')]
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
    try {
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

        // Notify user
        await ctx.telegram.sendMessage(
            payment.user.telegramId,
            `✅ <b>پرداخت شما تایید شد!</b>\n\n` +
            `🆔 شماره: <code>#${paymentNumber}</code>\n` +
            `💰 مبلغ: ${payment.amount.toLocaleString('fa-IR')} ${payment.method === 'card' ? 'تومان' : 'USDT'}\n` +
            `💳 موجودی جدید: ${(payment.user.balance + payment.amount).toLocaleString('fa-IR')} تومان\n\n` +
            `🎉 از اعتماد شما سپاسگزاریم.`,
            { parse_mode: 'HTML' }
        );

        // Update admin message
        try {
            await ctx.editMessageText(
                `✅ <b>پرداخت تایید شد</b>\n\n` +
                `🆔 شماره: <code>#${paymentNumber}</code>\n` +
                `👤 کاربر: ${payment.user.telegramId}\n` +
                `💰 مبلغ: ${payment.amount.toLocaleString('fa-IR')} ${payment.method === 'card' ? 'تومان' : 'USDT'}`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🔙 بازگشت به لیست', 'admin_pending_payments')]
                    ])
                }
            );
        } catch (error: any) {
            if (error.description?.includes('no text in the message')) {
                await ctx.reply(
                    `✅ <b>پرداخت تایید شد</b>\n\n` +
                    `🆔 شماره: <code>#${paymentNumber}</code>\n` +
                    `👤 کاربر: ${payment.user.telegramId}\n` +
                    `💰 مبلغ: ${payment.amount.toLocaleString('fa-IR')} ${payment.method === 'card' ? 'تومان' : 'USDT'}`,
                    {
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🔙 بازگشت به لیست', 'admin_pending_payments')]
                        ])
                    }
                );
            } else {
                throw error;
            }
        }

        await ctx.answerCbQuery('✅ تایید شد!');
    } catch (error) {
        console.error('Error approving payment:', error);
        await ctx.answerCbQuery('❌ خطا در تایید پرداخت!');
    }
};

const rejectPayment = async (ctx: BotContext, paymentId: number) => {
    try {
        const payment = await prisma.payment.update({
            where: { id: paymentId },
            data: { status: 'rejected' },
            include: { user: true }
        });

        const paymentNumber = generatePaymentNumber(payment.id);

        // Notify user
        await ctx.telegram.sendMessage(
            payment.user.telegramId,
            `❌ <b>پرداخت شما رد شد</b>\n\n` +
            `🆔 شماره: <code>#${paymentNumber}</code>\n` +
            `💰 مبلغ: ${payment.amount.toLocaleString('fa-IR')} ${payment.method === 'card' ? 'تومان' : 'USDT'}\n\n` +
            `📞 لطفاً با پشتیبانی تماس بگیرید:\n` +
            `@${process.env.SUPPORT_USERNAME || 'support'}`,
            { parse_mode: 'HTML' }
        );

        // Update admin message
        try {
            await ctx.editMessageText(
                `❌ <b>پرداخت رد شد</b>\n\n` +
                `🆔 شماره: <code>#${paymentNumber}</code>\n` +
                `👤 کاربر: ${payment.user.telegramId}\n` +
                `💰 مبلغ: ${payment.amount.toLocaleString('fa-IR')} ${payment.method === 'card' ? 'تومان' : 'USDT'}`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🔙 بازگشت به لیست', 'admin_pending_payments')]
                    ])
                }
            );
        } catch (error: any) {
            if (error.description?.includes('no text in the message')) {
                await ctx.reply(
                    `❌ <b>پرداخت رد شد</b>\n\n` +
                    `🆔 شماره: <code>#${paymentNumber}</code>\n` +
                    `👤 کاربر: ${payment.user.telegramId}\n` +
                    `💰 مبلغ: ${payment.amount.toLocaleString('fa-IR')} ${payment.method === 'card' ? 'تومان' : 'USDT'}`,
                    {
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🔙 بازگشت به لیست', 'admin_pending_payments')]
                        ])
                    }
                );
            } else {
                throw error;
            }
        }

        await ctx.answerCbQuery('❌ رد شد!');
    } catch (error) {
        console.error('Error rejecting payment:', error);
        await ctx.answerCbQuery('❌ خطا در رد پرداخت!');
    }
};

// ==================== CONFIGS SECTION ====================

const showConfigsMenu = async (ctx: BotContext) => {
    let text = `⚙️ <b>مدیریت کانفیگ‌ها</b>\n\n`;
    text += `👇 بخش مورد نظر را انتخاب کنید:\n\n`;
    text += `📦 <b>پلن‌ها:</b> قیمت‌گذاری و مدت زمان\n`;
    text += `🔗 <b>ساب‌ها:</b> لینک‌های سابسکرایب\n`;
    text += `🌍 <b>سرورها:</b> تنظیمات سرورها`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('📦 مدیریت پلن‌ها', 'edit_plans'),
            Markup.button.callback('🔗 مدیریت ساب‌ها', 'subs_manager')
        ],
        [
            Markup.button.callback('🌍 مدیریت سرورها', 'edit_servers'),
            Markup.button.callback('📊 آمار موجودی', 'admin_inventory')
        ],
        [Markup.button.callback('🔙 بازگشت', 'back_admin')]
    ]);

    await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
    await ctx.answerCbQuery();
};

// ==================== BROADCAST SECTION ====================

const startBroadcast = async (ctx: BotContext) => {
    if (!ctx.session) ctx.session = {};
    ctx.session.adminState = 'broadcast';

    await ctx.editMessageText(
        `📢 <b>ارسال پیام همگانی</b>\n\n` +
        `پیام خود را وارد کنید:\n` +
        `(متن، عکس، ویدیو یا هر چیزی)\n\n` +
        `⚠️ این پیام به همه کاربران ارسال خواهد شد.`,
        Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'back_admin')]])
    );
    await ctx.answerCbQuery();
};

const handleBroadcast = async (ctx: BotContext): Promise<boolean> => {
    if (!ctx.session || ctx.session.adminState !== 'broadcast') return false;

    const users = await prisma.user.findMany();
    let success = 0;
    let failed = 0;

    const statusMsg = await ctx.reply('📢 در حال ارسال...');

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
        `📢 <b>ارسال همگانی انجام شد</b>\n\n` +
        `✅ موفق: ${success}\n` +
        `❌ ناموفق: ${failed}`,
        adminBackKeyboard()
    );

    return true;
};

// ==================== GIFT CARDS SECTION ====================

const showGiftCardsMenu = async (ctx: BotContext) => {
    let text = `🎁 <b>سیستم کد هدیه</b>\n\n`;
    text += `💡 با این بخش می‌توانید کدهای تخفیف یا شارژ هدیه ایجاد کنید.\n\n`;
    text += `📌 انواع کد:\n`;
    text += `├ 💰 افزایش موجودی\n`;
    text += `├ 📦 تخفیف خرید پلن\n`;
    text += `└ 🎟 دسترسی ویژه`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('➕ ایجاد کد جدید', 'giftcard_create'),
            Markup.button.callback('📋 لیست کدها', 'giftcard_list')
        ],
        [
            Markup.button.callback('📊 آمار استفاده', 'giftcard_stats'),
            Markup.button.callback('🗑 غیرفعال کردن', 'giftcard_disable')
        ],
        [Markup.button.callback('🔙 بازگشت', 'back_admin')]
    ]);

    await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
    await ctx.answerCbQuery();
};

// ==================== FINANCE SECTION ====================

const showFinanceMenu = async (ctx: BotContext) => {
    const stats = await getDetailedStats();

    let text = `🏦 <b>مدیریت مالی</b>\n\n`;
    text += `📊 گزارش مالی:\n\n`;
    text += `💰 <b>درآمدها</b>\n`;
    text += `├ امروز: ${stats.todayRevenue.toLocaleString('fa-IR')} تومان\n`;
    text += `├ این هفته: ${(stats.todayRevenue * 7).toLocaleString('fa-IR')} تومان\n`;
    text += `└ این ماه: ${stats.monthRevenue.toLocaleString('fa-IR')} تومان\n\n`;

    text += `💎 <b>موجودی کاربران</b>\n`;
    text += `└ کل: ${stats.totalBalance.toLocaleString('fa-IR')} تومان\n\n`;

    text += `⏳ <b>پرداخت‌های در انتظار</b>\n`;
    text += `└ ${stats.pendingPayments} مورد`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('📈 گزارش کامل', 'finance_report'),
            Markup.button.callback('💸 برداشت وجه', 'finance_withdraw')
        ],
        [Markup.button.callback('🔙 بازگشت', 'back_admin')]
    ]);

    await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
    await ctx.answerCbQuery();
};

// ==================== INVENTORY SECTION ====================

const showInventory = async (ctx: BotContext) => {
    const inventory = getInventoryStatus();

    await ctx.editMessageText(inventory, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 بروزرسانی', 'admin_inventory')],
            [Markup.button.callback('🔙 بازگشت', 'back_admin')]
        ])
    });
    await ctx.answerCbQuery();
};

// ==================== SETUP FUNCTION ====================

export const setupAdmin = (bot: any, mainMenuText: string, mainKeyboard: any) => {

    // ===== MAIN ENTRY =====
    bot.command('admin', async (ctx: BotContext) => {
        await enterAdminPanel(ctx);
    });

    // ===== NAVIGATION =====
    bot.action('back_admin', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};

        const welcomeText =
            `🔐 <b>پنل مدیریت رگارِی</b>\n\n` +
            `👋 سلام ادمین عزیز\n` +
            `📅 ${new Date().toLocaleDateString('fa-IR')}\n\n` +
            `از منوی زیر بخش مورد نظر را انتخاب کنید:`;

        await ctx.editMessageText(welcomeText, {
            parse_mode: 'HTML',
            ...adminMainKeyboard()
        });
        await ctx.answerCbQuery();
    });

    bot.action('exit_admin', async (ctx: BotContext) => {
        await exitAdmin(ctx, mainMenuText, mainKeyboard);
    });

    // ===== STATS =====
    bot.action('admin_stats', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await showEnhancedStats(ctx);
    });

    // ===== USERS =====
    bot.action('admin_users_menu', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await showUsersMenu(ctx);
    });

    bot.action('admin_users', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await showAllUsers(ctx);
    });

    // ===== PAYMENTS =====
    bot.action('admin_payments', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await showPaymentsMenu(ctx);
    });

    bot.action('admin_pending_payments', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await showPendingPayments(ctx);
    });

    bot.action(/manage_payment_(\d+)/, async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        const paymentId = parseInt(ctx.match![1]);
        await managePayment(ctx, paymentId);
    });

    bot.action(/approve_pay_(\d+)/, async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        const paymentId = parseInt(ctx.match![1]);
        await approvePayment(ctx, paymentId);
    });

    bot.action(/reject_pay_(\d+)/, async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        const paymentId = parseInt(ctx.match![1]);
        await rejectPayment(ctx, paymentId);
    });

    // ===== CONFIGS =====
    bot.action('admin_configs', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await showConfigsMenu(ctx);
    });

    // ===== INVENTORY =====
    bot.action('admin_inventory', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await showInventory(ctx);
    });

    // ===== BROADCAST =====
    bot.action('admin_broadcast', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await startBroadcast(ctx);
    });

    // ===== GIFT CARDS =====
    bot.action('admin_giftcards', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await showGiftCardsMenu(ctx);
    });

    // ===== FINANCE =====
    bot.action('admin_finance', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await showFinanceMenu(ctx);
    });

    // ===== MESSAGE HANDLER FOR BROADCAST =====
    bot.on('message', async (ctx: BotContext, next: () => void) => {
        if (!ctx.session) ctx.session = {};

        const handled = await handleBroadcast(ctx);
        if (!handled) return next();
    });
};