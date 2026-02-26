// src/components/adminSubs.ts
import { Markup } from 'telegraf';
import * as fs from 'fs';
import * as path from 'path';
import { BotContext } from '../types';
import { isAdminUser } from '../utils/adminAuth';

const SUBS_FILE = path.join(__dirname, '../config/subs.json');

interface SubData {
    [month: string]: {
        [traffic: string]: string[];
    };
}

function loadSubs(): SubData {
    try {
        return JSON.parse(fs.readFileSync(SUBS_FILE, 'utf-8'));
    } catch (error) {
        console.error('Error loading subs:', error);
        return {};
    }
}

function saveSubs(data: SubData): void {
    try {
        fs.writeFileSync(SUBS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
        console.error('Error saving subs:', error);
        throw error;
    }
}

function getMonthName(month: number): string {
    const names: { [key: string]: string } = {
        '0': '⚡ تست',
        '1': '📅 ۱ ماهه',
        '2': '📆 ۲ ماهه',
        '3': '🗓 ۳ ماهه',
        '6': '📊 ۶ ماهه',
        '12': '📈 ۱۲ ماهه'
    };
    return names[month.toString()] || `${month} ماهه`;
}

// ==================== MAIN MENU ====================

export const showSubsManager = async (ctx: BotContext) => {
    const subs = loadSubs();
    const months = Object.keys(subs).sort((a, b) => parseInt(a) - parseInt(b));

    let text = `🔗 <b>مدیریت سابسکرایب‌ها</b>\n\n`;
    text += `📊 <b>آمار کلی:</b>\n`;

    let totalLinks = 0;
    const monthStats: { [key: string]: number } = {};

    months.forEach(month => {
        const traffics = Object.keys(subs[month]);
        let monthTotal = 0;
        traffics.forEach(t => {
            monthTotal += subs[month][t]?.length || 0;
        });
        totalLinks += monthTotal;
        monthStats[month] = monthTotal;
    });

    months.forEach(month => {
        const monthName = getMonthName(parseInt(month));
        text += `• ${monthName}: ${monthStats[month]} لینک\n`;
    });

    text += `\n📦 <b>مجموع:</b> ${totalLinks} لینک\n\n`;
    text += `👇 یک دسته را انتخاب کنید:`;

    const buttons = months.map(month => {
        const monthName = getMonthName(parseInt(month));
        return [Markup.button.callback(
            `${monthName} (${monthStats[month]} لینک)`,
            `subs_month_${month}`
        )];
    });

    buttons.push([
        Markup.button.callback('➕ افزودن دسته جدید', 'subs_add_category'),
        Markup.button.callback('📝 ویرایش خام', 'subs_edit_raw')
    ]);
    buttons.push([Markup.button.callback('🔙 بازگشت به ادمین', 'back_admin')]);

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
    });
};

// ==================== MONTH VIEW ====================

export const showTrafficCategories = async (ctx: BotContext, month: string) => {
    const subs = loadSubs();
    const monthData = subs[month] || {};
    const traffics = Object.keys(monthData).sort((a, b) => parseInt(a) - parseInt(b));

    const monthName = getMonthName(parseInt(month));

    let text = `${monthName}\n\n`;
    text += `👇 ترافیک مورد نظر را انتخاب کنید:\n\n`;

    if (traffics.length === 0) {
        text += `❌ هیچ ترافیکی تعریف نشده`;
    }

    const buttons = traffics.map(traffic => {
        const count = monthData[traffic]?.length || 0;
        const label = traffic === '0' ? '♾ نامحدود' : `📊 ${traffic}GB`;
        return [Markup.button.callback(
            `${label} (${count} لینک)`,
            `subs_traffic_${month}_${traffic}`
        )]});

    buttons.push([
        Markup.button.callback('➕ افزودن ترافیک', `subs_add_traffic_${month}`),
        Markup.button.callback('❌ حذف ماه', `subs_del_month_${month}`)
    ]);
    buttons.push([Markup.button.callback('🔙 بازگشت', 'subs_manager')]);

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
    });
};

// ==================== TRAFFIC/LINKS VIEW ====================

export const showLinksList = async (ctx: BotContext, month: string, traffic: string) => {
    const subs = loadSubs();
    const links = subs[month]?.[traffic] || [];
    const monthName = getMonthName(parseInt(month));
    const trafficLabel = traffic === '0' ? '♾ نامحدود' : `📊 ${traffic}GB`;

    let text = `${monthName} - ${trafficLabel}\n\n`;

    if (links.length === 0) {
        text += `❌ هیچ لینکی موجود نیست\n`;
    } else {
        text += `<b>لینک‌ها:</b>\n\n`;
        links.forEach((link, idx) => {
            const shortLink = link.length > 50 ? link.substring(0, 50) + '...' : link;
            text += `${idx + 1}. <code>${shortLink}</code>\n`;
        });
    }

    text += `\n📊 <b>تعداد:</b> ${links.length} لینک`;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('➕ افزودن لینک', `subs_add_link_${month}_${traffic}`)],
        [
            Markup.button.callback('🗑 حذف لینک', `subs_remove_link_${month}_${traffic}`),
            Markup.button.callback('📋 کپی همه', `subs_copy_all_${month}_${traffic}`)
        ],
        [Markup.button.callback('🔙 بازگشت', `subs_month_${month}`)]
    ]);

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...keyboard
    });
};

// ==================== ADD LINK FLOW ====================

export const startAddLink = async (ctx: BotContext, month: string, traffic: string) => {
    if (!ctx.session) ctx.session = {};
    ctx.session.adminState = `add_link_${month}_${traffic}`;

    const monthName = getMonthName(parseInt(month));
    const trafficLabel = traffic === '0' ? '♾ نامحدود' : `📊 ${traffic}GB`;

    await ctx.editMessageText(
        `➕ <b>افزودن لینک جدید</b>\n\n` +
        `📅 دسته: ${monthName}\n` +
        `📊 ترافیک: ${trafficLabel}\n\n` +
        `🔗 لطفاً لینک سابسکرایب را ارسال کنید:\n\n` +
        `💡 نکته: لینک باید با http یا https شروع شود.`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('❌ انصراف', `subs_traffic_${month}_${traffic}`)]
            ])
        }
    );
};

// ==================== SETUP HANDLERS ====================

export const setupAdminSubs = (bot: any) => {

    // Main menu
    bot.action('subs_manager', async (ctx: BotContext) => {
        if (!isAdminUser(ctx)) {
            await ctx.answerCbQuery('⛔ دسترسی ندارید');
            return;
        }
        await showSubsManager(ctx);
        await ctx.answerCbQuery();
    });

    // Month selection
    bot.action(/subs_month_(\d+)/, async (ctx: BotContext) => {
        if (!isAdminUser(ctx)) {
            await ctx.answerCbQuery('⛔ دسترسی ندارید');
            return;
        }
        const month = ctx.match![1];
        await showTrafficCategories(ctx, month);
        await ctx.answerCbQuery();
    });

    // Traffic selection
    bot.action(/subs_traffic_(\d+)_(.+)/, async (ctx: BotContext) => {
        if (!isAdminUser(ctx)) {
            await ctx.answerCbQuery('⛔ دسترسی ندارید');
            return;
        }
        const month = ctx.match![1];
        const traffic = ctx.match![2];
        await showLinksList(ctx, month, traffic);
        await ctx.answerCbQuery();
    });

    // Add link - start flow
    bot.action(/subs_add_link_(\d+)_(.+)/, async (ctx: BotContext) => {
        if (!isAdminUser(ctx)) {
            await ctx.answerCbQuery('⛔ دسترسی ندارید');
            return;
        }
        const month = ctx.match![1];
        const traffic = ctx.match![2];
        await startAddLink(ctx, month, traffic);
        await ctx.answerCbQuery();
    });

    // Handle text input for adding links
    bot.on('text', async (ctx: BotContext, next: () => void) => {
        if (!ctx.session?.adminState?.startsWith('add_link_')) return next();

        const match = ctx.session.adminState.match(/add_link_(\d+)_(.+)/);
        if (!match) return next();

        const month = match[1];
        const traffic = match[2];
        const link = (ctx.message as any).text.trim();

        // Validate URL
        if (!link.startsWith('http://') && !link.startsWith('https://')) {
            await ctx.reply(
                '❌ <b>لینک نامعتبر!</b>\n\n' +
                'لینک باید با http:// یا https:// شروع شود.\n' +
                'لطفاً دوباره ارسال کنید:',
                { parse_mode: 'HTML' }
            );
            return;
        }

        try {
            const subs = loadSubs();
            if (!subs[month]) subs[month] = {};
            if (!subs[month][traffic]) subs[month][traffic] = [];

            subs[month][traffic].push(link);
            saveSubs(subs);

            delete ctx.session.adminState;

            await ctx.reply('✅ لینک با موفقیت اضافه شد!');
            await showLinksList(ctx, month, traffic);
        } catch (error) {
            console.error('Error saving link:', error);
            await ctx.reply('❌ خطا در ذخیره لینک! لطفاً دوباره تلاش کنید.');
        }
    });

    // Remove link menu
    bot.action(/subs_remove_link_(\d+)_(.+)/, async (ctx: BotContext) => {
        if (!isAdminUser(ctx)) {
            await ctx.answerCbQuery('⛔ دسترسی ندارید');
            return;
        }

        const month = ctx.match![1];
        const traffic = ctx.match![2];
        const subs = loadSubs();
        const links = subs[month]?.[traffic] || [];

        if (links.length === 0) {
            await ctx.answerCbQuery('❌ هیچ لینکی برای حذف وجود ندارد!');
            return;
        }

        const buttons = links.map((link, idx) => {
            const shortLink = link.length > 30 ? link.substring(0, 30) + '...' : link;
            return [Markup.button.callback(
                `${idx + 1}. ${shortLink}`,
                `subs_del_confirm_${month}_${traffic}_${idx}`
            )];
        });

        buttons.push([Markup.button.callback('🔙 بازگشت', `subs_traffic_${month}_${traffic}`)]);

        await ctx.editMessageText(
            `🗑 <b>حذف لینک</b>\n\n` +
            `لینک مورد نظر برای حذف را انتخاب کنید:`,
            { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
        );
        await ctx.answerCbQuery();
    });

    // Confirm delete
    bot.action(/subs_del_confirm_(\d+)_(.+)_(\d+)/, async (ctx: BotContext) => {
        if (!isAdminUser(ctx)) {
            await ctx.answerCbQuery('⛔ دسترسی ندارید');
            return;
        }

        const month = ctx.match![1];
        const traffic = ctx.match![2];
        const index = parseInt(ctx.match![3]);

        try {
            const subs = loadSubs();
            if (subs[month]?.[traffic]) {
                subs[month][traffic].splice(index, 1);
                saveSubs(subs);
            }

            await ctx.answerCbQuery('✅ لینک حذف شد');
            await showLinksList(ctx, month, traffic);
        } catch (error) {
            console.error('Error removing link:', error);
            await ctx.answerCbQuery('❌ خطا در حذف لینک');
        }
    });

    // Copy all links
    bot.action(/subs_copy_all_(\d+)_(.+)/, async (ctx: BotContext) => {
        if (!isAdminUser(ctx)) {
            await ctx.answerCbQuery('⛔ دسترسی ندارید');
            return;
        }

        const month = ctx.match![1];
        const traffic = ctx.match![2];
        const subs = loadSubs();
        const links = subs[month]?.[traffic] || [];

        if (links.length === 0) {
            await ctx.answerCbQuery('❌ هیچ لینکی موجود نیست!');
            return;
        }

        const text = links.join('\n\n');

        await ctx.reply(
            `📋 <b>لیست لینک‌ها</b> (${links.length} مورد)\n\n` +
            `<pre>${text}</pre>`,
            { parse_mode: 'HTML' }
        );
        await ctx.answerCbQuery('✅ لیست ارسال شد');
    });
};