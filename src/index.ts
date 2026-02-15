import {Markup, session, Telegraf} from 'telegraf';
import {prisma} from './prisma/client';
import {BotContext} from './types';
import {setupFAQ} from './components/faq';
import {setupAdmin} from './components/admin';
import * as fs from 'fs';
import * as path from 'path';
import {setupPlans} from "./components/plans";
import {setupBalance} from "./components/balance";
import {setupMyPlans} from "./components/myplans";
import {setupSupport} from "./components/support";

// Load configs
const plansConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/plans.json'), 'utf-8'));

// Initialize bot
const bot = new Telegraf<BotContext>(process.env.BOT_TOKEN!);

// ==================== MIDDLEWARE ====================

bot.use(session());
bot.use(async (ctx, next) => {
    if (!ctx.session) {
        ctx.session = {};
    }

    if (ctx.from) {
        ctx.dbUser = await prisma.user.upsert({
            where: {telegramId: ctx.from.id.toString()},
            update: {},
            create: {
                telegramId: ctx.from.id.toString(),
                username: ctx.from.username,
                firstName: ctx.from.first_name,
                lastName: ctx.from.last_name,
            },
        });
    }
    return next();
});

// ==================== MAIN MENU ====================

const mainInlineKeyboard = () => Markup.inlineKeyboard([
    [Markup.button.callback('📋 پلن‌های من', 'my_plans')],
    [
        Markup.button.callback('💰 افزایش موجودی', 'add_balance'),
        Markup.button.callback('📦 پلن‌ها', 'view_plans')
    ],
    [
        Markup.button.callback('🆘 پشتیبانی', 'support'),
        Markup.button.callback('❓ سوالات تکراری', 'faq')
    ],
    // [
    //     Markup.button.callback('👥 رفرال', 'referral'),
    //     Markup.button.callback('🔧 تست سرور', 'server_test')
    // ]
]);

const getMainMenuText = (user: any) =>
    `👋 سلام ${user.firstName || 'کاربر عزیز'}!\n\n` +
    `🚀 به راگاری خوامدید!\n` +
    `📡 فروشنده کانفیگ V2Ray با کیفیت بالا\n\n` +
    `💰 موجودی: ${user.balance.toLocaleString()} تومان\n\n` +
    `👇 یکی از گزینه‌ها را انتخاب کنید:`;

// ==================== SETUP COMPONENTS ====================

// Setup Plans (Modular)
setupPlans(bot);
setupMyPlans(bot);

// Setup Balance (Modular)
setupBalance(bot);

// Setup FAQ (Modular)
setupFAQ(bot);

setupSupport(bot);

// Setup Admin (Modular) - Pass main menu for exit
setupAdmin(bot, getMainMenuText({ firstName: 'کاربر عزیز', balance: 0 }), mainInlineKeyboard());

// ==================== START ====================

bot.start(async (ctx) => {
    const args = ctx.message.text.split(' ');
    const refCode = args[1];

    if (refCode && refCode.startsWith('ref_')) {
        const code = refCode.replace('ref_', '');
        await prisma.user.update({
            where: { telegramId: ctx.from.id.toString() },
            data: { referredBy: code }
        });
        await ctx.reply('✅ شما با موفقیت عضو شدید! کد رفرال شما ثبت شد.');
    }

    const user = ctx.dbUser;
    await ctx.reply(getMainMenuText(user), mainInlineKeyboard());
});

bot.action('back_main', async (ctx) => {
    const user = ctx.dbUser;
    await ctx.editMessageText(getMainMenuText(user), mainInlineKeyboard());
    await ctx.answerCbQuery();
});

// ==================== REFERRAL ====================

bot.action('referral', async (ctx) => {
    const user = ctx.dbUser;
    const botInfo = await ctx.telegram.getMe();
    const refLink = `https://t.me/${botInfo.username}?start=ref_${user.referralCode}`;

    const refCount = await prisma.user.count({
        where: { referredBy: user.referralCode }
    });

    await ctx.editMessageText(
        `👥 سیستم رفرال:\n\n` +
        `🔗 لینک شما:\n<code>${refLink}</code>\n\n` +
        `📊 تعداد رفرال: ${refCount} نفر\n` +
        `💰 هر رفرال: ۱۰,۰۰۰ تومان\n\n` +
        `✅ با دعوت هر دوست به بات، ۱۰,۰۰۰ تومان جایزه بگیرید!`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔗 اشتراک لینک', `share_ref_${user.referralCode}`)],
                [Markup.button.callback('🔙 بازگشت', 'back_main')]
            ])
        }
    );
    await ctx.answerCbQuery();
});

bot.action(/share_ref_(\w+)/, async (ctx) => {
    const refCode = ctx.match[1];
    const botInfo = await ctx.telegram.getMe();
    const refLink = `https://t.me/${botInfo.username}?start=ref_${refCode}`;

    await ctx.answerCbQuery();
    await ctx.reply(
        `👥 لینک رفرال شما:\n${refLink}\n\n` +
        `این لینک را برای دوستان خود ارسال کنید!`
    );
});

// ==================== SERVER TEST ====================

bot.action('server_test', async (ctx) => {
    await ctx.editMessageText(
        `🔧 تست سرور:\n\n` +
        `⚠️ سرور تست در حال حاضر <b>بسته</b> است.\n` +
        `🔒 ظرفیت کانفیگ تست تکمیل شده است.\n\n` +
        `📦 برای استفاده از سرویس، یک پلن خریداری کنید:`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📦 مشاهده پلن‌ها', 'view_plans')],
                [Markup.button.callback('🔙 بازگشت', 'back_main')]
            ])
        }
    );
    await ctx.answerCbQuery();
});

// ==================== ERROR HANDLER ====================

bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}`, err);
    ctx.reply('❌ خطایی رخ داد. لطفاً دوباره تلاش کنید.').catch(console.error);
});

// ==================== LAUNCH ====================

// ──── Webhook Setup ────
if (process.env.NODE_ENV === 'production') {
    const webhookDomain = process.env.WEBHOOK_DOMAIN || 'https://your-app-name.onrender.com';  // مثلاً https://ragaray-bot.onrender.com
    const secretPath = `/telegraf/${process.env.BOT_TOKEN!.slice(-10)}`;  // مسیر مخفی برای امنیت

    bot.launch({
        webhook: {
            domain: webhookDomain,
            hookPath: secretPath,          // مسیر webhook → https://your-app.onrender.com/telegraf/abc123xyz
            port: Number(process.env.PORT) || 3000,
            secretToken: process.env.WEBHOOK_SECRET || 'your-random-secret-32-chars',  // اختیاری ولی خیلی توصیه می‌شه
        },
    })
        .then(() => {
            console.log(`🤖 Webhook bot launched on ${webhookDomain}${secretPath}`);
        })
        .catch((err) => {
            console.error('Webhook launch failed:', err);
        });
} else {
    // برای توسعه محلی → polling معمولی
    bot.launch();
    console.log('🤖 Bot running in polling mode (development)');
}

console.log('🤖 RagaRay Bot is running...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));