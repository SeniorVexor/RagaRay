// src/handlers/adminConfigs.ts
import { Markup } from 'telegraf';
import * as fs from 'fs';
import * as path from 'path';
import { BotContext } from '../types';
import { isAdminUser } from '../utils/adminAuth';

const CONFIG_DIR = path.join(__dirname, '../config');

function loadJson(fileName: string): any {
    const filePath = path.join(CONFIG_DIR, fileName);
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function saveJson(fileName: string, data: any): void {
    const filePath = path.join(CONFIG_DIR, fileName);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// کامند اصلی
export function registerAdminConfigs(bot: any) {
    bot.action('admin_configs', async (ctx: BotContext) => {
        if (!isAdminUser(ctx)) return ctx.reply('⛔ دسترسی ندارید');

        ctx.session.adminState = null;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('ویرایش پلن‌ها (plans.json)', 'edit_plans')],
            [Markup.button.callback('مدیریت ساب‌ها (subs.json)', 'edit_subs')],
            [Markup.button.callback('مدیریت سرورها (servers.json)', 'edit_servers')],
            [Markup.button.callback('برگشت', 'back_admin')],
        ]);

        await ctx.editMessageText('انتخاب کنید:', keyboard);
    });

    // ویرایش plans.json به صورت مستقیم با JSON
    bot.action('edit_plans', async (ctx: BotContext) => {
        if (!isAdminUser(ctx)) return ctx.answerCbQuery('⛔ دسترسی ندارید');
        await ctx.answerCbQuery();

        const plans = loadJson('plans.json');
        ctx.session.adminState = 'edit_plans_json';

        await ctx.reply(
            '📦 ویرایش فایل `plans.json`\n\n' +
            '🔹 ساختار فعلی:\n' +
            `<code>${JSON.stringify(plans, null, 2)}</code>\n\n` +
            '✏️ برای ویرایش، نسخه‌ی جدید JSON را به صورت کامل ارسال کنید.\n' +
            '⚠️ حتماً JSON معتبر باشد؛ در غیر این صورت ذخیره نمی‌شود.',
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 بازگشت به تنظیمات کانفیگ', 'admin_configs')],
                    [Markup.button.callback('🏠 بازگشت به ادمین', 'back_admin')],
                ]),
            }
        );
    });

    // ویرایش subs.json
    bot.action('edit_subs', async (ctx: BotContext) => {
        if (!isAdminUser(ctx)) return ctx.answerCbQuery('⛔ دسترسی ندارید');
        await ctx.answerCbQuery();

        const subs = loadJson('subs.json');
        ctx.session.adminState = 'edit_subs_json';

        await ctx.reply(
            '🔗 مدیریت ساب‌ها (`subs.json`)\n\n' +
            '🔹 ساختار فعلی:\n' +
            `<code>${JSON.stringify(subs, null, 2)}</code>\n\n` +
            '✏️ برای اضافه/حذف لینک‌ها، JSON کامل و اصلاح‌شده را ارسال کنید.\n' +
            'مثلاً می‌توانید یک لینک جدید به آرایه‌ی مربوطه اضافه کنید یا یکی را حذف کنید.',
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 بازگشت به تنظیمات کانفیگ', 'admin_configs')],
                    [Markup.button.callback('🏠 بازگشت به ادمین', 'back_admin')],
                ]),
            }
        );
    });

    // ویرایش servers.json
    bot.action('edit_servers', async (ctx: BotContext) => {
        if (!isAdminUser(ctx)) return ctx.answerCbQuery('⛔ دسترسی ندارید');
        await ctx.answerCbQuery();

        const servers = loadJson('servers.json');
        ctx.session.adminState = 'edit_servers_json';

        await ctx.reply(
            '🌍 مدیریت سرورها (`servers.json`)\n\n' +
            '🔹 لیست فعلی سرورها:\n' +
            `<code>${JSON.stringify(servers, null, 2)}</code>\n\n` +
            '✏️ برای اضافه/حذف/ویرایش سرور، JSON کامل و اصلاح‌شده را ارسال کنید.\n' +
            'به عنوان مثال می‌توانید یک سرور جدید به آرایه اضافه کنید یا مقادیر یک سرور را تغییر دهید.',
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 بازگشت به تنظیمات کانفیگ', 'admin_configs')],
                    [Markup.button.callback('🏠 بازگشت به ادمین', 'back_admin')],
                ]),
            }
        );
    });

    // هندل کردن پیام متنی برای ذخیره JSON جدید
    bot.on('text', async (ctx: BotContext, next: () => void) => {
        // فقط وقتی در حالت ادمین و یکی از حالت‌های ویرایش فایل هستیم
        if (!ctx.session?.adminMode) return next();

        const state = ctx.session.adminState;
        if (
            state !== 'edit_plans_json' &&
            state !== 'edit_subs_json' &&
            state !== 'edit_servers_json'
        ) {
            return next();
        }

        const text = (ctx.message as any).text;
        let fileName: string;

        if (state === 'edit_plans_json') fileName = 'plans.json';
        else if (state === 'edit_subs_json') fileName = 'subs.json';
        else fileName = 'servers.json';

        try {
            const parsed = JSON.parse(text);
            saveJson(fileName, parsed);
            ctx.session.adminState = null;

            await ctx.reply(
                `✅ فایل <code>${fileName}</code> با موفقیت بروزرسانی شد.`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🔙 بازگشت به تنظیمات کانفیگ', 'admin_configs')],
                        [Markup.button.callback('🏠 بازگشت به ادمین', 'back_admin')],
                    ]),
                }
            );
        } catch (err: any) {
            await ctx.reply(
                '❌ JSON نامعتبر است!\n\n' +
                `پیام خطا:\n<code>${err.message || err.toString()}</code>\n\n` +
                'لطفاً دوباره JSON صحیح ارسال کنید.',
                { parse_mode: 'HTML' }
            );
        }
    });
}