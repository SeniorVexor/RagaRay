import { Markup } from 'telegraf';

export const createBackButton = (callback: string) =>
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', callback)]]);

export const createCancelButton = () =>
    Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'cancel_operation')]]);

export const chunkButtons = (buttons: any[], chunkSize: number = 2) => {
    const chunks = [];
    for (let i = 0; i < buttons.length; i += chunkSize) {
        chunks.push(buttons.slice(i, i + chunkSize));
    }
    return chunks;
};