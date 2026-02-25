// src/handlers/adminUsers.ts
import { Markup } from 'telegraf';
import { prisma } from '../prisma/client'; // مسیر prisma رو درست کن
import { BotContext } from '../types';
import { isAdminUser } from '../utils/adminAuth';

export function registerAdminUsers(bot: any) {
    bot.command('admin_users', async (ctx: BotContext) => {
        if (!ctx.from || !isAdminUser(ctx)) {
            return ctx.reply('⛔ دسترسی ندارید');
        }

        try {
            const users = await prisma.user.findMany({
                select: {
                    id: true,
                    telegramId: true,
                    username: true,
                    firstName: true,
                    balance: true,
                    isAdmin: true,
                    referralCode: true,
                    createdAt: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 20, // برای جلوگیری از پیام خیلی بلند
            });

            if (users.length === 0) {
                return ctx.reply('هیچ کاربری ثبت نشده است.');
            }

            let text = `👥 لیست کاربران (${users.length} مورد اخیر):\n\n`;
            users.forEach(u => {
                text += `ID: ${u.id} | @${u.username || u.telegramId}\n`;
                text += `نام: ${u.firstName || '?'} | موجودی: ${u.balance} تومان\n`;
                text += `ادمین: ${u.isAdmin ? '✅' : '❌'} | کد معرف: ${u.referralCode}\n`;
                text += `ثبت: ${u.createdAt.toLocaleDateString('fa-IR')}\n────────────────\n`;
            });

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🔍 جستجوی کاربر', 'admin_user_search')],
                [Markup.button.callback('✏️ ویرایش کاربر', 'admin_user_edit')],
                [Markup.button.callback('📊 آمار کلی', 'admin_stats')],
            ]);

            await ctx.reply(text, { reply_markup: keyboard.reply_markup, parse_mode: 'HTML' });
        } catch (err: any) {
            await ctx.reply(`خطا در بارگذاری کاربران: ${err.message}`);
        }
    });

    // جستجوی کاربر
    bot.action('admin_user_search', async (ctx: BotContext) => {
        await ctx.answerCbQuery();
        await ctx.reply('آیدی عددی تلگرام یا یوزرنیم (با @) را ارسال کنید:');
        // در فایل اصلی بات باید on('text') داشته باشی که این پیام رو هندل کنه
        // مثلاً:
        // bot.on('text', async (ctx) => { if در حالت جستجو ... prisma.user.findFirst(...) })
    });

    // ویرایش کاربر (می‌تونی wizard بسازی)
    bot.action('admin_user_edit', async (ctx: BotContext) => {
        await ctx.answerCbQuery();
        await ctx.reply('آیدی کاربر (عددی) را برای ویرایش ارسال کنید:');
        // سپس در on text → پیدا کردن کاربر → نمایش گزینه‌های ویرایش (balance, isAdmin, ...)
    });

    // آمار ساده
    bot.action('admin_stats', async (ctx: BotContext) => {
        await ctx.answerCbQuery();
        try {
            const totalUsers = await prisma.user.count();
            const totalAdmins = await prisma.user.count({ where: { isAdmin: true } });
            const totalBalance = await prisma.user.aggregate({ _sum: { balance: true } });

            const text = `
📊 آمار کلی:
تعداد کاربران: ${totalUsers}
تعداد ادمین‌ها: ${totalAdmins}
جمع کل موجودی‌ها: ${totalBalance._sum.balance || 0} تومان
      `;
            await ctx.reply(text);
        } catch (err: any) {
            await ctx.reply(`خطا: ${err.message}`);
        }
    });
}