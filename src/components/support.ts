import { Markup } from 'telegraf';
import { BotContext } from '../types';
import * as fs from 'fs';
import * as path from 'path';

// Load configs
import config from "../config/admin.json"
// ==================== SUPPORT ====================

export const setupSupport = (bot: any) => {
    bot.action('support', async (ctx: BotContext) => {
        try {
            // 🆕 چک کردن وجود support
            const support = config?.admins.support;

            if (!support || !support.username) {
                await ctx.editMessageText(
                    '❌ اطلاعات پشتیبانی تنظیم نشده است.\n\n' +
                    'لطفاً بعداً دوباره امتحان کنید.',
                    Markup.inlineKeyboard([
                        [Markup.button.callback('🔙 بازگشت', 'back_main')]
                    ])
                );
                await ctx.answerCbQuery();
                return;
            }

            const adminUsername = support.username.replace('@', '');
            const channel = support.channel || 'تنظیم نشده';

            await ctx.editMessageText(
                `🆘 پیگیری و پشتیبانی:\n\n` +
                `👤 ادمین: @${support.username}\n` +
                `📢 کانال: @${channel}\n\n` +
                `📝 برای پشتیبانی:\n` +
                `۱. مشکل خود را کامل توضیح دهید\n` +
                `۲. شماره پیگیری (اگر دارید) ارسال کنید\n` +
                `۳. اسکرین‌شات از مشکل (اگر امکان دارد)\n\n` +
                `⏳ زمان پاسخ: ۲۴ ساعت`,
                Markup.inlineKeyboard([
                    [Markup.button.url('👤 چت با ادمین', `https://t.me/${adminUsername}`)],
                    [Markup.button.callback('🔙 بازگشت', 'back_main')]
                ])
            );
            await ctx.answerCbQuery();

        } catch (error) {
            console.error('Support error:', error);
            await ctx.editMessageText(
                '❌ خطا در بارگذاری اطلاعات پشتیبانی.',
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 بازگشت', 'back_main')]
                ])
            );
            await ctx.answerCbQuery();
        }
    });
};