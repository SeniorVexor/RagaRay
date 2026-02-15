import { Markup } from 'telegraf';
import { BotContext } from '../types';
import { prisma } from '../prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// Load config
const balanceConfig = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../config/balance.json'), 'utf-8')
);

const { methods } = balanceConfig;

// ==================== CONSTANTS ====================

const MIN_AMOUNT = 200000;
const MAX_AMOUNT = 10000000;

// ==================== HELPERS ====================

const formatPrice = (amount: number, currency: string = 'تومان'): string =>
    `${amount.toLocaleString('')} ${currency}`;

// تولید شماره پرداخت ۵ رقمی
const generatePaymentNumber = (id: number): string => {
    return id.toString().padStart(5, '0');
};

const isTextMessage = (message: any): message is { text: string } => {
    return message && typeof message.text === 'string';
};

const isPhotoMessage = (message: any): message is { photo: Array<{ file_id: string }> } => {
    return message && Array.isArray(message.photo);
};

// ==================== KEYBOARDS ====================

const methodsKeyboard = () => {
    const buttons = methods
        .filter((m: any) => !m.disabled)
        .map((method: any) => ([
            Markup.button.callback(`${method.emoji} ${method.title}`, `balance_method_${method.id}`)
        ]));

    buttons.push([Markup.button.callback('🔙 بازگشت', 'back_main')]);
    return Markup.inlineKeyboard(buttons);
};

const cancelKeyboard = () =>
    Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'balance_cancel')]]);

const afterCancelKeyboard = () =>
    Markup.inlineKeyboard([
        [Markup.button.callback('💰 افزایش موجودی', 'add_balance')],
        [Markup.button.callback('🏠 منوی اصلی', 'back_main')]
    ]);

// ==================== HANDLERS ====================

const showMethods = async (ctx: BotContext) => {
    const text = `💰 <b>افزایش موجودی</b>

لطفاً روش پرداخت مورد نظر را انتخاب کنید:`;

    await ctx.editMessageText(text, { parse_mode: 'HTML', ...methodsKeyboard() });
};

const showMethodDetails = async (ctx: BotContext, methodId: string) => {
    const method = methods.find((m: any) => m.id === methodId);

    if (!method) {
        await ctx.answerCbQuery('❌ روش نامعتبر!');
        return;
    }

    if (method.disabled) {
        await ctx.editMessageText(
            `⚠️ <b>این روش موقتاً غیرفعال است</b>\n\nلطفاً از روش کارت به کارت استفاده کنید.`,
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([
                    [Markup.button.callback('💳 کارت به کارت', 'balance_method_card')],
                    [Markup.button.callback('🔙 بازگشت', 'add_balance')]
                ])}
        );
        return;
    }

    ctx.session.paymentMethod = methodId;

    let fullMessage = '';

    if (methodId === 'card') {
        const cardNumber = process.env.PAYMENT_CARD_NUMBER || '6037XXXXXXXXXXXX';
        const cardOwner = process.env.PAYMENT_CARD_NUMBER_OWNER || 'نامشخص';

        fullMessage = `💳 <b>پرداخت با کارت به کارت</b>

<b>شماره کارت:</b> <code>${cardNumber}</code>
<b>به نام:</b> ${cardOwner}

⚠️ <b>مهم:</b>
• رسید باید واضح و خوانا باشد
• پرداخت فقط به کارت بالا مجاز است

💰 <b>لطفاً مبلغ شارژ موردنظر را به تومان وارد نمایید</b>

🔽 حداقل: ${formatPrice(MIN_AMOUNT)}
🔼 حداکثر: ${formatPrice(MAX_AMOUNT)}

⚠️ توجه:
• مبالغ به <b>تومان</b> می‌باشد
• اعداد اعشاری پذیرفته نمی‌شود
• مبلغ باید بین حداقل و حداکثر باشد

✅ پس از وارد کردن مبلغ، رسید پرداخت را ارسال کنید.`;

    } else if (methodId === 'crypto') {
        const wallet = process.env.CRYPTO_WALLET || 'TRC20_WALLET_ADDRESS';

        fullMessage = `🪙 <b>پرداخت با تتر (USDT)</b>

<b>شبکه:</b> TRC20 (Tron)
<b>آدرس کیف پول:</b>
<code>${wallet}</code>

⚠️ <b>مهم:</b>
• فقط شبکه TRC20
• ارسال به آدرس بالا الزامی است
• کارمزد شبکه را رعایت کنید

💰 <b>افزایش موجودی با کریپتو</b>

لطفاً مبلغ را به <b>USDT</b> وارد کنید:

🔽 حداقل: ۱۰ USDT
🔼 حداکثر: ۵۰۰ USDT

⚠️ فقط اعداد صحیح (بدون اعشار)

✅ پس از وارد کردن مبلغ، TX Hash را ارسال کنید.`;
    }

    await ctx.editMessageText(
        fullMessage,
        { parse_mode: 'HTML', ...cancelKeyboard() }
    );

    ctx.session.awaitingAmount = true;
    await ctx.answerCbQuery();
};

const handleAmountInput = async (ctx: BotContext): Promise<boolean> => {
    if (!ctx.session.awaitingAmount || !ctx.session.paymentMethod) return false;

    if (!isTextMessage(ctx.message)) {
        await ctx.reply('❌ لطفاً متن وارد کنید:', cancelKeyboard());
        return true;
    }

    const inputText = ctx.message.text.replace(/,/g, '').trim();
    const amount = parseInt(inputText);

    const method = methods.find((m: any) => m.id === ctx.session.paymentMethod);
    const isCrypto = method?.id === 'crypto';

    if (isNaN(amount) || amount <= 0) {
        await ctx.reply(
            '❌ <b>خطا!</b>\n\nمبلغ وارد شده نامعتبر است.\nلطفاً فقط عدد صحیح وارد کنید.',
            { parse_mode: 'HTML', ...cancelKeyboard() }
        );
        return true;
    }

    if (isCrypto) {
        if (amount < 10 || amount > 500) {
            await ctx.reply(
                '❌ <b>خطا!</b>\n\nمبلغ باید بین ۱۰ تا ۵۰۰ USDT باشد.',
                { parse_mode: 'HTML', ...cancelKeyboard() }
            );
            return true;
        }
    } else {
        if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
            await ctx.reply(
                `❌ <b>خطا!</b>\n\nمبلغ باید بین ${formatPrice(MIN_AMOUNT)} و ${formatPrice(MAX_AMOUNT)} باشد.`,
                { parse_mode: 'HTML', ...cancelKeyboard() }
            );
            return true;
        }
    }

    ctx.session.pendingPayment = {
        method: ctx.session.paymentMethod,
        amount: amount,
        currency: isCrypto ? 'USDT' : 'تومان'
    };

    delete ctx.session.awaitingAmount;
    ctx.session.awaitingReceipt = true;

    const receiptType = method?.id === 'card' ? 'اسکرین‌شات فاکتور' : 'TX Hash';

    await ctx.reply(
        `✅ <b>مبلغ ثبت شد</b>

💵 مبلغ: ${formatPrice(amount, ctx.session.pendingPayment.currency)}

${method?.id === 'card' ?
            `📸 لطفاً <b>اسکرین‌شات فاکتور پرداخت</b> را ارسال کنید:

✓ رسید باید واضح باشد
✓ تاریخ و ساعت مشخص باشد
✓ مبلغ قابل خواندن باشد` :
            `🔗 لطفاً <b>TX Hash</b> تراکنش را ارسال کنید:

✓ فقط متن Hash (بدون لینک)
✓ تراکنش باید تایید شده باشد`}`,
        { parse_mode: 'HTML', ...cancelKeyboard() }
    );

    return true;
};

const handlePhotoReceipt = async (ctx: BotContext): Promise<boolean> => {
    if (!ctx.session.awaitingReceipt || ctx.session.paymentMethod !== 'card') return false;

    if (!isPhotoMessage(ctx.message)) {
        await ctx.reply('❌ لطفاً عکس ارسال کنید:', cancelKeyboard());
        return true;
    }

    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const user = ctx.dbUser;
    const payment = ctx.session.pendingPayment;

    if (!payment) {
        await ctx.reply('❌ خطا در اطلاعات پرداخت!', cancelKeyboard());
        return true;
    }

    const dbPayment = await prisma.payment.create({
        data: {
            userId: user.id,
            amount: payment.amount,
            method: 'card',
            status: 'pending',
            receipt: photo.file_id
        }
    });

    const paymentNumber = generatePaymentNumber(dbPayment.id);

    // 🆕 ارسال با caption به جای text جداگانه
    const caption =
        `💳 <b>پرداخت جدید</b>\n\n` +
        `🆔 شماره: <code>#${paymentNumber}</code>\n` +
        `👤 کاربر: ${user.telegramId}\n` +
        `💰 مبلغ: ${formatPrice(payment.amount)}\n` +
        `🏦 روش: کارت به کارت\n` +
        `👤 به نام: ${process.env.PAYMENT_CARD_NUMBER_OWNER || 'نامشخص'}\n\n` +
        `⏳ در انتظار تایید...`;

    await ctx.telegram.sendPhoto(
        process.env.ADMIN_ID!,
        photo.file_id,
        {
            caption: caption,
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('✅ تایید', `approve_pay_${dbPayment.id}`)],
                [Markup.button.callback('❌ رد', `reject_pay_${dbPayment.id}`)]
            ])
        }
    );

    delete ctx.session.awaitingReceipt;
    delete ctx.session.pendingPayment;
    delete ctx.session.paymentMethod;
    delete ctx.session.awaitingAmount;

    await ctx.reply(
        `✅ <b>رسید دریافت شد!</b>\n\n` +
        `🆔 شماره پیگیری: <code>#${paymentNumber}</code>\n` +
        `⏳ پرداخت شما در صف بررسی است.\n` +
        `📊 وضعیت: در انتظار تایید ادمین\n\n` +
        `🔔 پس از تایید، موجودی به حساب شما اضافه خواهد شد.`,
        { parse_mode: 'HTML', ...afterCancelKeyboard() }
    );

    return true;
};

const handleTextReceipt = async (ctx: BotContext): Promise<boolean> => {
    if (!ctx.session.awaitingReceipt || ctx.session.paymentMethod !== 'crypto') return false;

    if (!isTextMessage(ctx.message)) {
        await ctx.reply('❌ لطفاً TX Hash را به صورت متن ارسال کنید:', cancelKeyboard());
        return true;
    }

    const txHash = ctx.message.text.trim();
    const user = ctx.dbUser;
    const payment = ctx.session.pendingPayment;

    if (!payment) {
        await ctx.reply('❌ خطا در اطلاعات پرداخت!', cancelKeyboard());
        return true;
    }

    const dbPayment = await prisma.payment.create({
        data: {
            userId: user.id,
            amount: payment.amount,
            method: 'crypto',
            status: 'pending',
            receipt: txHash
        }
    });

    const paymentNumber = generatePaymentNumber(dbPayment.id);

    await ctx.telegram.sendMessage(
        process.env.ADMIN_ID!,
        `🪙 <b>پرداخت کریپتو جدید</b>\n\n` +
        `🆔 شماره: <code>#${paymentNumber}</code>\n` +
        `👤 کاربر: ${user.telegramId}\n` +
        `💰 مبلغ: ${payment.amount} USDT\n` +
        `🔗 TX Hash:\n<code>${txHash}</code>\n\n` +
        `⏳ در انتظار تایید...`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('✅ تایید', `approve_pay_${dbPayment.id}`)],
                [Markup.button.callback('❌ رد', `reject_pay_${dbPayment.id}`)]
            ])
        }
    );

    delete ctx.session.awaitingReceipt;
    delete ctx.session.pendingPayment;
    delete ctx.session.paymentMethod;
    delete ctx.session.awaitingAmount;

    await ctx.reply(
        `✅ <b>TX Hash دریافت شد!</b>\n\n` +
        `🆔 شماره پیگیری: <code>#${paymentNumber}</code>\n` +
        `⏳ پرداخت شما در صف بررسی است.\n` +
        `📊 وضعیت: در انتظار تایید ادمین\n\n` +
        `🔔 پس از تایید، موجودی به حساب شما اضافه خواهد شد.`,
        { parse_mode: 'HTML', ...afterCancelKeyboard() }
    );

    return true;
};

const cancelOperation = async (ctx: BotContext) => {
    delete ctx.session.awaitingAmount;
    delete ctx.session.awaitingReceipt;
    delete ctx.session.pendingPayment;
    delete ctx.session.paymentMethod;

    await ctx.editMessageText(
        `❌ <b>عملیات لغو شد</b>\n\nمی‌توانید دوباره تلاش کنید.`,
        { parse_mode: 'HTML', ...afterCancelKeyboard() }
    );
    await ctx.answerCbQuery('لغو شد');
};

// ==================== SETUP ====================

export const setupBalance = (bot: any) => {
    bot.action('add_balance', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await showMethods(ctx);
        await ctx.answerCbQuery();
    });

    bot.action(/balance_method_(\w+)/, async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        const methodId = ctx.match![1];
        await showMethodDetails(ctx, methodId);
        await ctx.answerCbQuery();
    });

    bot.action('balance_cancel', async (ctx: BotContext) => {
        if (!ctx.session) ctx.session = {};
        await cancelOperation(ctx);
    });

    bot.on('text', async (ctx: BotContext, next: () => void) => {
        if (!ctx.session) ctx.session = {};

        if (ctx.session.awaitingAmount) {
            const handled = await handleAmountInput(ctx);
            if (handled) return;
        }

        if (ctx.session.awaitingReceipt && ctx.session.paymentMethod === 'crypto') {
            const handled = await handleTextReceipt(ctx);
            if (handled) return;
        }

        return next();
    });

    bot.on('photo', async (ctx: BotContext, next: () => void) => {
        if (!ctx.session) ctx.session = {};

        if (ctx.session.awaitingReceipt && ctx.session.paymentMethod === 'card') {
            const handled = await handlePhotoReceipt(ctx);
            if (handled) return;
        }

        return next();
    });
};