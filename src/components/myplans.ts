import { Markup } from 'telegraf';
import { BotContext } from '../types';
import { prisma } from '../prisma/client';

// ==================== HELPERS ====================

const formatStatus = (isActive: boolean, expiryDate: Date): string => {
    const now = new Date();
    const expiry = new Date(expiryDate);

    if (!isActive) return '❌ غیرفعال';
    if (now > expiry) return '⏰ منقضی شده';

    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return `✅ فعال`;
};

const formatExpiry = (date: Date): string => {
    const daysLeft = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysLeft > 0 ? `${daysLeft} روز` : '❌ منقضی شده';
};

const formatPurchase = (purchase: any) => {
    const config = JSON.parse(purchase.configData);
    return {
        text:
            `📦 ${config.ps || 'کانفیگ'}\n` +
            `⏳ ${purchase.plan.duration} روز | 📊 ${purchase.plan.traffic}GB\n` +
            `💰 ${purchase.plan.price} تومان\n` +
            `🔌 وضعیت: ${formatStatus(purchase.plan.isActive, purchase.expiryDate)}`,
        callback: `view_config_${purchase.id}`
    };
};

const copySubLink = async (ctx: BotContext, purchaseId: number) => {
    const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });
    if (!purchase) {
        await ctx.answerCbQuery('❌ پلن یافت نشد!');
        return;
    }

    const configData = JSON.parse(purchase.configData);
    const subUrl = configData?.add;  // 🆕 استفاده از 'add' به جای 'subUrl'

    if (!subUrl) {
        await ctx.answerCbQuery('❌ لینک یافت نشد!');
        return;
    }

    await ctx.reply(
        `🔗 لینک اشتراک شما:\n\n<code>${subUrl}</code>\n\n📋 برای کپی روی متن بالا نگه دارید.`,
        { parse_mode: 'HTML' }
    );
    await ctx.answerCbQuery('✅ لینک ارسال شد');
};

// ==================== KEYBOARDS ====================

const myPlansListKeyboard = (purchases: any[]) => {
    const buttons = purchases.map((purchase) => {
        const configName = purchase.configData ? JSON.parse(purchase.configData).ps : `پلن #${purchase.id}`;
        const status = formatStatus(purchase.plan.isActive, purchase.expiryDate);  // 🆕 اصلاح شد

        return [Markup.button.callback(`${configName} (${status})`, `view_myplan_${purchase.id}`)];
    });
    buttons.push([Markup.button.callback('🏠 منوی اصلی', 'back_main')]);
    return Markup.inlineKeyboard(buttons);
};

const planDetailKeyboard = (purchaseId: number, isActive: boolean) => {
    const buttons = [];
    if (isActive) {
        buttons.push([Markup.button.callback('📋 دریافت کانفیگ', `get_config_${purchaseId}`)]);
        buttons.push([Markup.button.callback('🔄 تمدید', `renew_plan_${purchaseId}`)]);
    }
    buttons.push([Markup.button.callback('🔙 بازگشت به لیست', 'my_plans')]);
    buttons.push([Markup.button.callback('🏠 منوی اصلی', 'back_main')]);
    return Markup.inlineKeyboard(buttons);
};

// ==================== HANDLERS ====================

const showMyPlans = async (ctx: BotContext) => {
    const user = ctx.dbUser;

    const purchases = await prisma.purchase.findMany({
        where: { userId: user.id },
        include: { plan: true },
        orderBy: { createdAt: 'desc' }
    });

    if (purchases.length === 0) {
        await ctx.editMessageText(
            '❌ شما هیچ پلنی ندارید.\n\n📦 از قسمت پلن‌ها می‌توانید خرید کنید.',
            Markup.inlineKeyboard([
                [Markup.button.callback('📦 مشاهده پلن‌ها', 'view_plans')],
                [Markup.button.callback('🏠 منوی اصلی', 'back_main')]
            ])
        );
        return;
    }

    const text = '📋 پلن‌های شما:\n\nبرای دیدن جزئیات روی هر پلن کلیک کنید:';
    await ctx.editMessageText(text, myPlansListKeyboard(purchases));
};

const showPlanDetail = async (ctx: BotContext, purchaseId: number) => {
    const purchase = await prisma.purchase.findUnique({
        where: { id: purchaseId },
        include: { plan: true }
    });

    if (!purchase) {
        await ctx.answerCbQuery('❌ پلن یافت نشد!');
        return;
    }

    const configData = purchase.configData ? JSON.parse(purchase.configData) : null;
    const configName = configData?.ps || purchase.plan?.name || `پلن #${purchase.id}`;
    const subUrl = configData?.add || null;  // 🆕 استفاده از 'add'

    let text = `📦 ${configName}\n\n` +
        `⏳ مدت: ${purchase.plan?.name || 'نامشخص'}\n` +
        `📊 ترافیک: ${purchase.plan?.traffic || '?'}GB\n` +
        `🔗 کانکشن: ${purchase.plan?.connections || 'نامحدود'} دستگاه\n` +
        `📅 انقضا: ${purchase.expiryDate.toLocaleDateString('fa-IR')}\n` +
        `⏳ باقی‌مانده: ${formatExpiry(purchase.expiryDate)}\n` +
        `🔌 وضعیت: ${formatStatus(purchase.plan.isActive, purchase.expiryDate)}`;  // 🆕 اصلاح شد

    if (subUrl) text += `\n\n🔗 لینک اشتراک:\n<code>${subUrl}</code>`;

    const keyboard = Markup.inlineKeyboard([
        ...(subUrl ? [[Markup.button.callback('📋 کپی لینک', `copy_sub_${purchaseId}`)]] : []),
        [Markup.button.callback('🔙 بازگشت به لیست', 'my_plans')],
        [Markup.button.callback('🏠 منوی اصلی', 'back_main')]
    ]);

    await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
    await ctx.answerCbQuery();
};

const getConfig = async (ctx: BotContext, purchaseId: number) => {
    const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });
    if (!purchase) {
        await ctx.answerCbQuery('❌ پلن یافت نشد!');
        return;
    }

    const configData = JSON.parse(purchase.configData);

    await ctx.reply(
        `🔑 کانفیگ شما:\n\n<code>${JSON.stringify(configData, null, 2)}</code>\n\n📋 برای کپی روی متن بالا نگه دارید.`,
        { parse_mode: 'HTML' }
    );
    await ctx.answerCbQuery('✅ کانفیگ ارسال شد');
};

// ==================== SETUP ====================

export const setupMyPlans = (bot: any) => {
    bot.action('my_plans', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await showMyPlans(ctx);
        await ctx.answerCbQuery();
    });

    bot.action(/view_myplan_(\d+)/, async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        const purchaseId = parseInt(ctx.match![1]);
        await showPlanDetail(ctx, purchaseId);
        await ctx.answerCbQuery();
    });

    bot.action(/get_config_(\d+)/, async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        const purchaseId = parseInt(ctx.match![1]);
        await getConfig(ctx, purchaseId);
    });

    bot.action(/renew_plan_(\d+)/, async (ctx: BotContext) => {
        await ctx.answerCbQuery('⏳ تمدید در حال توسعه است...');
    });

    bot.action(/copy_sub_(\d+)/, async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        const purchaseId = parseInt(ctx.match![1]);
        await copySubLink(ctx, purchaseId);
    });
};