import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
    // Load plans config
    const plansConfig = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../src/config/plans.json'), 'utf-8')
    );

    const { durations, trafficOptions } = plansConfig;

    console.log('🌱 Seeding plans...');

    // Create plans for each duration + traffic combination
    for (const duration of durations) {
        const options = trafficOptions[duration.id.toString()] || [];

        for (const option of options) {
            const planId = duration.id * 1000 + option.traffic; // 1_30 -> 1030

            await prisma.plan.upsert({
                where: { id: planId },
                update: {
                    name: `${duration.name} - ${option.traffic}GB`,
                    duration: duration.days,
                    price: option.price,
                    traffic: option.traffic,
                    connections: option.connections,
                    isActive: true
                },
                create: {
                    id: planId,
                    name: `${duration.name} - ${option.traffic}GB`,
                    duration: duration.days,
                    price: option.price,
                    traffic: option.traffic,
                    connections: option.connections,
                    isActive: true
                }
            });

            console.log(`✅ Plan ${planId}: ${duration.name} - ${option.traffic}GB`);
        }
    }

    console.log('✨ Seeding completed!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });