// src/jobs/expiryCheck.ts (run with node-cron)
import cron from 'node-cron';

// Har 1 saat check kon
cron.schedule('0 * * * *', async () => {
    const expiringSoon = await prisma.purchase.findMany({
        where: {
            expiryDate: {
                lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 rooz dige
                gt: new Date()
            },
            notified: false
        }
    });

    for (const purchase of expiringSoon) {
        // Notify user
        await bot.telegram.sendMessage(
            purchase.user.telegramId,
            `⏳ پلن شما تا ۳ روز دیگر منقضی می‌شود!\n` +
            `برای تمدید اقدام کنید.`
        );

        // Mark as notified
        await prisma.purchase.update({
            where: { id: purchase.id },
            data: { notified: true }
        });
    }
});