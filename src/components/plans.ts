import {Markup} from 'telegraf';
import {BotContext} from '../types';
import {prisma} from '../prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// Load configs
const plansConfig = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../config/plans.json'), 'utf-8')
);

const subsConfig = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../config/subs.json'), 'utf-8')
);

const serversConfig = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../config/servers.json'), 'utf-8')
);

const { durations, trafficOptions, messages } = plansConfig;
const { servers } = serversConfig;

// ==================== HELPERS ====================

const hasAvailableService = (durationId: number, traffic: number): boolean => {
    const durationSubs = subsConfig[durationId.toString()];
    if (!durationSubs) return false;
    const trafficKey = traffic.toString();
    const services = durationSubs[trafficKey];
    return services && Array.isArray(services) && services.length > 0;
};

const getAvailableService = (durationId: number, traffic: number): string | null => {
    const durationSubs = subsConfig[durationId.toString()];
    if (!durationSubs) return null;
    const trafficKey = traffic.toString();
    const services = durationSubs[trafficKey];
    if (!services || !Array.isArray(services) || services.length === 0) return null;
    return services[0];
};

const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

const formatPrice = (price: number): string =>
    `${price} تومان`;

const formatText = (text: string, replacements: Record<string, string>): string => {
    let result = text;
    Object.entries(replacements).forEach(([key, value]) => {
        result = result.replace(`{${key}}`, value);
    });
    return result;
};

const safeEditMessage = async (ctx: BotContext, text: string, keyboard: any) => {
    try {
        await ctx.editMessageText(text, keyboard);
    } catch (error: any) {
        if (error.description?.includes('message is not modified')) return;
        throw error;
    }
};

// ==================== KEYBOARDS ====================

const durationKeyboard = () => {
    const buttons = durations.map((d: any) => ([
        Markup.button.callback(`${d.emoji} ${d.name}`, `select_duration_${d.id}`)
    ]));
    buttons.push([Markup.button.callback('🔙 بازگشت', 'back_main')]);
    return Markup.inlineKeyboard(buttons);
};

const serverKeyboard = () => {
    const buttons = servers.map((s: any) => ([
        Markup.button.callback(`🌍 ${s.name} (${s.location}) - ${s.ping}ms`, `select_server_${s.id}`)
    ]));
    buttons.push([Markup.button.callback('🔙 بازگشت', 'view_plans')]);
    return Markup.inlineKeyboard(buttons);
};

const trafficKeyboard = (durationId: number, options: any[]) => {
    const buttons = options.map((opt: any) => ([
        Markup.button.callback(`📊 ${opt.traffic}GB - ${formatPrice(opt.price)}`, `select_traffic_${opt.id}`)
    ]));
    buttons.push([Markup.button.callback('🔙 انتخاب مدت دیگر', 'view_plans')]);
    buttons.push([Markup.button.callback('🏠 منوی اصلی', 'back_main')]);
    return Markup.inlineKeyboard(buttons);
};

const purchaseConfirmKeyboard = (planId: string, hasBalance: boolean) => {
    const buttons = [];
    if (hasBalance) {
        buttons.push([Markup.button.callback('✅ تایید و ادامه', `confirm_purchase_${planId}`)]);
    } else {
        buttons.push([Markup.button.callback('💰 افزایش موجودی', 'add_balance')]);
    }
    buttons.push([Markup.button.callback('🔙 انتخاب حجم دیگر', `back_traffic_${planId.split('_')[0]}`)]);
    buttons.push([Markup.button.callback('🏠 منوی اصلی', 'back_main')]);
    return Markup.inlineKeyboard(buttons);
};

const cancelKeyboard = () =>
    Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'cancel_purchase')]]);

// ==================== HANDLERS ====================

const showDurationSelection = async (ctx: BotContext) => {
    await ctx.editMessageText(messages.selectDuration, durationKeyboard());
};

const showServerSelection = async (ctx: BotContext) => {
    await safeEditMessage(ctx, '🌍 لطفاً سرور مورد نظر خود را انتخاب کنید:\n\n⚡ سرور با پینگ کمتر = سرعت بهتر', serverKeyboard());
};

const showTrafficOptions = async (ctx: BotContext, durationId: number) => {
    const duration = durations.find((d: any) => d.id === durationId);
    if (!duration) {
        await ctx.answerCbQuery('❌ خطا در بارگذاری!');
        return;
    }

    ctx.session.selectedDuration = durationId;

    const availableOptions = trafficOptions[durationId.toString()]?.filter((opt: any) => {
        return hasAvailableService(durationId, opt.traffic);
    }) || [];

    if (availableOptions.length === 0) {
        await ctx.editMessageText(
            '❌ متأسفانه در حال حاضر هیچ سرویسی برای این مدت موجود نیست.\n\nلطفاً بعداً دوباره امتحان کنید یا با پشتیبانی تماس بگیرید.',
            Markup.inlineKeyboard([
                [Markup.button.callback('🔙 انتخاب مدت دیگر', 'view_plans')],
                [Markup.button.callback('🏠 منوی اصلی', 'back_main')]
            ])
        );
        return;
    }

    const text = formatText(messages.selectTraffic, { duration: duration.name });
    await ctx.editMessageText(text, trafficKeyboard(durationId, availableOptions));
};

const showPlanDetails = async (ctx: BotContext, planId: string) => {
    const [durationId, trafficId] = planId.split('_');
    const duration = durations.find((d: any) => d.id === parseInt(durationId));
    const option = trafficOptions[durationId]?.find((o: any) => o.id === planId);

    if (!duration || !option) {
        await ctx.answerCbQuery('❌ پلن یافت نشد!');
        return;
    }

    ctx.session.selectedPlan = {
        id: planId,
        duration: duration,
        traffic: option.traffic,
        price: option.price,
        connections: option.connections,
        days: duration.days,
        serviceUrl: ctx.session.selectedService
    };

    // console.log('Selected plan:', ctx.session.selectedPlan);

    const user = ctx.dbUser;
    const hasBalance = user.balance >= option.price;
    const deficit = option.price - user.balance;
    const connectionText = option.connections === 0 ? 'نامحدود' : option.connections.toString();

    const status = hasBalance
        ? '✅ آیا از خرید اطمینان دارید؟'
        : `❌ موجودی کافی نیست! (کسری: ${formatPrice(deficit)})`;

    const text = formatText(messages.planDetails, {
        duration: duration.name,
        traffic: option.traffic.toString(),
        connections: connectionText,
        price: formatPrice(option.price),
        balance: formatPrice(user.balance),
        status: status
    });

    await ctx.editMessageText(text, { parse_mode: 'HTML', ...purchaseConfirmKeyboard(planId, hasBalance) });
};

const askConfigName = async (ctx: BotContext) => {
    ctx.session.awaitingConfigName = true;
    await ctx.editMessageText(
        messages.askConfigName,
        Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'cancel_purchase')]])
    );
};

const handleConfigName = async (ctx: BotContext): Promise<boolean> => {
    if (!ctx.session.awaitingConfigName) return false;
    if (!ctx.session.pendingPlan) {
        await ctx.reply('❌ خطا: اطلاعات خرید یافت نشد! لطفاً دوباره شروع کنید.');
        return true;
    }

    if (!ctx.message || typeof (ctx.message as any).text !== 'string') {
        await ctx.reply('❌ لطفاً نام را به صورت متن وارد کنید:');
        return true;
    }

    const configName = (ctx.message as any).text.trim();
    if (configName.length < 1 || configName.length > 50) {
        await ctx.reply('❌ نام باید بین ۱ تا ۵۰ کاراکتر باشد:');
        return true;
    }

    ctx.session.pendingPlan.configName = configName;
    delete ctx.session.awaitingConfigName;

    // console.log('Config name set:', configName);
    // console.log('Pending plan:', ctx.session.pendingPlan);

    await finalizePurchase(ctx);
    return true;
};

const cancelPurchase = async (ctx: BotContext) => {
    delete ctx.session.pendingPlan;
    delete ctx.session.awaitingConfigName;
    delete ctx.session.selectedPlan;
    delete ctx.session.selectedDuration;
    delete ctx.session.selectedService;

    await ctx.editMessageText(
        '❌ خرید لغو شد.',
        Markup.inlineKeyboard([
            [Markup.button.callback('📦 مشاهده پلن‌ها', 'view_plans')],
            [Markup.button.callback('🏠 منوی اصلی', 'back_main')]
        ])
    );
    await ctx.answerCbQuery('لغو شد');
};

// ==================== FINALIZE PURCHASE ====================

const finalizePurchase = async (ctx: BotContext) => {
    const plan = ctx.session.pendingPlan;
    const user = ctx.dbUser;

    // console.log('=== finalizePurchase DEBUG ===');
    // console.log('user:', user);
    // console.log('user.id:', user?.id);
    // console.log('plan:', plan);
    // console.log('plan.configName:', plan?.configName);

    if (!plan || !plan.configName) {
        await ctx.reply('❌ خطا در پردازش خرید!');
        return;
    }

    if (!user || !user.id) {
        console.error('User or user.id is undefined!');
        await ctx.reply('❌ خطا: اطلاعات کاربر یافت نشد!');
        return;
    }

    const serviceUrl = plan.serviceUrl;
    if (!serviceUrl) {
        await ctx.reply('❌ خطا: لینک سرویس یافت نشد!');
        return;
    }

    const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!freshUser || freshUser.balance < plan.price) {
        await ctx.reply('❌ موجودی کافی نیست!');
        return;
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + plan.days);

    // 🆕 پیدا کردن یا ساختن Plan واقعی
    let dbPlan = await prisma.plan.findFirst({
        where: { duration: plan.duration.days, traffic: plan.traffic }
    });

    if (!dbPlan) {
        dbPlan = await prisma.plan.create({
            data: {
                name: `${plan.duration.name} - ${plan.traffic}GB`,
                duration: plan.duration.days,
                price: plan.price,
                traffic: plan.traffic,
                connections: plan.connections,
                isActive: true
            }
        });
    }

    let purchase;
    let config;

    try {
        await prisma.user.update({
            where: { id: user.id },
            data: { balance: { decrement: plan.price } }
        });

        purchase = await prisma.purchase.create({
            data: {
                userId: user.id,
                planId: dbPlan.id,  // 🆕 استفاده از id واقعی از دیتابیس
                configData: JSON.stringify({
                    v: "2",
                    ps: plan.configName,
                    add: serviceUrl,
                    traffic: plan.traffic
                }),
                expiryDate: expiryDate
            }
        });

        config = await prisma.config.create({
            data: {
                userId: user.id,
                uuid: generateUUID(),
                name: plan.configName,
                expiryDate: expiryDate
            }
        });
    } catch (error) {
        console.error('Purchase error:', error);
        await ctx.reply('❌ خطا در ثبت خرید! لطفاً با پشتیبانی تماس بگیرید.');
        return;
    }

    // حذف از subs.json
    try {
        const durationSubs = subsConfig[plan.duration.id.toString()];
        if (durationSubs) {
            const trafficKey = plan.traffic.toString();
            const services = durationSubs[trafficKey];
            if (services && Array.isArray(services)) {
                const index = services.indexOf(serviceUrl);
                if (index > -1) {
                    services.splice(index, 1);
                    await fs.promises.writeFile(
                        path.join(__dirname, '../config/subs.json'),
                        JSON.stringify(subsConfig, null, 2),
                        'utf-8'
                    );
                }
            }
        }
    } catch (error) {
        console.error('Failed to update subs.json:', error);
        await ctx.telegram.sendMessage(
            process.env.ADMIN_ID!,
            `⚠️ <b>هشدار</b>\n\nسرویس برای خرید #${purchase.id} اختصاص داده شد ولی از subs.json حذف نشد.\nلطفاً دستی حذف کنید.`,
            { parse_mode: 'HTML' }
        );
    }

    const formatDateEnglish = (date: Date): string => {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${year}-${month}-${day}`;
    };

    const toEnglishNumbers = (str: string): string => {
        const persianNumbers = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
        const englishNumbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        let result = str;
        persianNumbers.forEach((persian, index) => {
            result = result.replace(new RegExp(persian, 'g'), englishNumbers[index]);
        });
        return result;
    };

    const connectionText = plan.connections == 0 ? 'نامحدود' : plan.connections.toString();
    const durationNameEnglish = toEnglishNumbers(plan.duration.name);

    const text =
        `✅ خرید با موفقیت انجام شد!\n\n` +
        `📦 پلن: ${durationNameEnglish} - ${plan.traffic}GB\n` +
        `⏳ انقضا: ${formatDateEnglish(expiryDate)}\n` +
        `🔗 کانکشن: ${connectionText} \n` +
        `🏷 نام: ${plan.configName}\n\n` +
        `🔑 لینک سابسکرایپشن:\n${serviceUrl}\n\n` +
        `✅ پلن به لیست شما اضافه شد.`;

    await ctx.reply(
        text,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📋 پلن‌های من', 'my_plans')],
                [Markup.button.callback('🏠 منوی اصلی', 'back_main')]
            ])
        }
    );

    await ctx.telegram.sendMessage(
        process.env.ADMIN_ID!,
        `🛒 خرید جدید:\n` +
        `👤 کاربر: ${user.telegramId}\n` +
        `📦 پلن: ${durationNameEnglish} - ${plan.traffic}GB\n` +
        `🔗 کانکشن: ${connectionText}\n` +
        `🏷 نام: ${plan.configName}\n` +
        `💰 مبلغ: ${formatPrice(plan.price)}\n\n` +
        `🔗 لینک: ${serviceUrl}`
    );

    delete ctx.session.pendingPlan;
    delete ctx.session.selectedPlan;
    delete ctx.session.selectedDuration;
    delete ctx.session.selectedService;
};

const startPurchaseFlow = async (ctx: BotContext, planId: string) => {
    const plan = ctx.session.selectedPlan;
    if (!plan || plan.id !== planId) {
        await ctx.answerCbQuery('❌ پلن نامعتبر!');
        return;
    }

    const user = ctx.dbUser;
    if (user.balance < plan.price) {
        await ctx.answerCbQuery('❌ موجودی کافی نیست!');
        return;
    }

    ctx.session.pendingPlan = JSON.parse(JSON.stringify(plan));
    await askConfigName(ctx);
    await ctx.answerCbQuery();
};

export const setupPlans = (bot: any) => {
    bot.action('view_plans', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await showDurationSelection(ctx);
        await ctx.answerCbQuery();
    });

    bot.action(/select_duration_(\d+)/, async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        const durationId = parseInt(ctx.match![1]);
        ctx.session.selectedDuration = durationId;
        await showTrafficOptions(ctx, durationId);
        await ctx.answerCbQuery();
    });

    bot.action(/select_server_(\d+)/, async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        const serverId = parseInt(ctx.match![1]);
        const durationId = ctx.session.selectedDuration;
        if (!durationId) {
            await ctx.answerCbQuery('❌ خطا: مدت انتخاب نشده!');
            return;
        }
        await showTrafficOptions(ctx, durationId);
        await ctx.answerCbQuery();
    });

    bot.action('select_server_back', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await ctx.answerCbQuery('🔙 بازگشت به انتخاب سرور');
        try {
            await showServerSelection(ctx);
        } catch (error: any) {
            if (error.description?.includes('message is not modified')) return;
            throw error;
        }
    });

    bot.action(/select_traffic_(\d+_\d+)/, async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        const planId = ctx.match![1];
        const [durationId, trafficId] = planId.split('_');
        const traffic = parseInt(trafficId);

        const serviceUrl = getAvailableService(parseInt(durationId), traffic);
        if (!serviceUrl) {
            await ctx.answerCbQuery('❌ این سرویس در حال حاضر موجود نیست!');
            return;
        }

        ctx.session.selectedService = serviceUrl;
        await showPlanDetails(ctx, planId);
        await ctx.answerCbQuery();
    });

    bot.action(/back_traffic_(\d+)/, async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        const durationId = parseInt(ctx.match![1]);
        await showTrafficOptions(ctx, durationId);
        await ctx.answerCbQuery('🔙 بازگشت');
    });

    bot.action(/confirm_purchase_(\d+_\d+)/, async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        const planId = ctx.match![1];
        await startPurchaseFlow(ctx, planId);
        await ctx.answerCbQuery();
    });

    bot.on('text', async (ctx: BotContext, next: () => void) => {
        if (!ctx.session) ctx.session = {};
        if (ctx.session.awaitingConfigName) {
            const handled = await handleConfigName(ctx);
            if (handled) return;
        }
        return next();
    });

    bot.action('cancel_purchase', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await cancelPurchase(ctx);
    });
};