import * as fs from 'fs';
import * as path from 'path';

const SUBS_FILE = path.join(__dirname, '../config/subs.json');

// Interface baraye structure json asli
interface SubData {
    [month: string]: {
        [traffic: string]: string[];
    };
}

// Load subs data
const loadSubs = (): SubData => {
    return JSON.parse(fs.readFileSync(SUBS_FILE, 'utf-8'));
};

// Save subs data
const saveSubs = (data: SubData): void => {
    fs.writeFileSync(SUBS_FILE, JSON.stringify(data, null, 2));
};

// Check if sub available for plan
export const checkSubAvailable = (month: number, traffic: number): boolean => {
    const data = loadSubs();
    const monthKey = month.toString();
    const trafficKey = traffic.toString();

    // FIX: Check if month exists, then check traffic
    const monthData = data[monthKey];
    if (!monthData) return false;

    const trafficData = monthData[trafficKey];
    if (!Array.isArray(trafficData)) return false;

    return trafficData.length > 0;
};

// Get available sub count
export const getSubCount = (month: number, traffic: number): number => {
    const data = loadSubs();
    const monthKey = month.toString();
    const trafficKey = traffic.toString();

    const monthData = data[monthKey];
    if (!monthData) return 0;

    const trafficData = monthData[trafficKey];
    if (!Array.isArray(trafficData)) return 0;

    return trafficData.length;
};

// Assign sub to user
export const assignSub = (
    month: number,
    traffic: number,
    userId: string,
    purchaseId: number
): string | null => {
    const data = loadSubs();
    const monthKey = month.toString();
    const trafficKey = traffic.toString();

    // Check if available
    const monthData = data[monthKey];
    if (!monthData) return null;

    const trafficData = monthData[trafficKey];
    if (!Array.isArray(trafficData) || trafficData.length === 0) {
        return null;
    }

    // Get first available sub
    const subUrl = trafficData.shift()!;

    saveSubs(data);
    return subUrl;
};

// Return sub to inventory (if purchase cancelled/refunded)
export const returnSub = (
    subUrl: string,
    month: number,
    traffic: number
): boolean => {
    const data = loadSubs();
    const monthKey = month.toString();
    const trafficKey = traffic.toString();

    // Return to inventory
    if (!data[monthKey]) {
        data[monthKey] = {};
    }
    if (!data[monthKey][trafficKey]) {
        data[monthKey][trafficKey] = [];
    }

    data[monthKey][trafficKey].push(subUrl);

    saveSubs(data);
    return true;
};

// Get inventory status for admin
export const getInventoryStatus = (): string => {
    const data = loadSubs();
    let status = '📦 موجودی کانفیگ‌ها:\n\n';

    const months = ['1', '2', '3', '6', '12'];
    const traffics = ['20', '30', '50', '100', '0'];

    for (const month of months) {
        const monthName = {
            '1': '۱ ماهه',
            '2': '۲ ماهه',
            '3': '۳ ماهه',
            '6': '۶ ماهه',
            '12': '۱۲ ماهه'
        }[month];

        status += `${monthName}:\n`;

        const monthData = data[month];

        for (const traffic of traffics) {
            const count = monthData?.[traffic]?.length || 0;
            const trafficLabel = traffic === '0' ? 'نامحدود' : `${traffic}GB`;
            status += `  ${trafficLabel}: ${count} عدد\n`;
        }

        status += '\n';
    }

    return status;
};