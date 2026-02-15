import { Markup } from 'telegraf';
import { BotContext } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { createBackButton, chunkButtons } from '../utils/keyboard';

// Load FAQ data
const faqData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../config/faq.json'), 'utf-8')
);

// Get FAQ keyboard (menu asli)
export const getFAQKeyboard = () => {
    const buttons = faqData.map((item: any) => [
        Markup.button.callback(item.title, `faq_${item.id}`)
    ]);

    buttons.push([Markup.button.callback('🔙 بازگشت به منو', 'back_main')]);

    return Markup.inlineKeyboard(buttons);
};

// Get FAQ menu text
export const getFAQMenuText = () =>
    `❓ سوالات متداول\n\n` +
    `👇 یکی از موضوعات زیر را انتخاب کنید:`;

// Handle FAQ menu (show list)
export const handleFAQMenu = async (ctx: BotContext) => {
    await ctx.editMessageText(getFAQMenuText(), getFAQKeyboard());
};

// Handle FAQ item selection (show question & answer)
export const handleFAQItem = async (ctx: BotContext, faqId: string) => {
    const faq = faqData.find((f: any) => f.id === faqId);

    if (!faq) {
        await ctx.answerCbQuery('❓ سوال یافت نشد!');
        return;
    }

    const text = `❓ <b>${faq.question}</b>\n\n` +
        `💡 ${faq.answer}`;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔙 بازگشت به سوالات', 'faq_menu')],
        [Markup.button.callback('🏠 منوی اصلی', 'back_main')]
    ]);

    await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
    await ctx.answerCbQuery();
};

// Setup FAQ actions
export const setupFAQ = (bot: any) => {
    // Main FAQ menu
    bot.action('faq', async (ctx: BotContext) => {
        await handleFAQMenu(ctx);
        await ctx.answerCbQuery();
    });

    // Back to FAQ menu
    bot.action('faq_menu', async (ctx: BotContext) => {
        await handleFAQMenu(ctx);
        await ctx.answerCbQuery();
    });

    // Individual FAQ items
    faqData.forEach((item: any) => {
        bot.action(`faq_${item.id}`, async (ctx: BotContext) => {
            await handleFAQItem(ctx, item.id);
        });
    });
};