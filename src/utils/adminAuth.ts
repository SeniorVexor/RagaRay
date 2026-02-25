import * as fs from 'fs';
import * as path from 'path';
import { BotContext } from '../types';

const ADMIN_CONFIG_PATH = path.join(__dirname, '../config/admin.json');

let cachedAdminIds: string[] | null = null;

function loadAdminIds(): string[] {
    if (cachedAdminIds) return cachedAdminIds;

    try {
        const raw = fs.readFileSync(ADMIN_CONFIG_PATH, 'utf-8');
        const json = JSON.parse(raw);
        const ids = Array.isArray(json.adminIds) ? json.adminIds.map((id: any) => String(id)) : [];
        cachedAdminIds = ids;
        return ids;
    } catch (e) {
        console.error('Failed to load admin IDs from admin.json:', e);
        cachedAdminIds = [];
        return [];
    }
}

export function isAdminUser(ctx: BotContext): boolean {
    const fromId = ctx.from?.id;
    if (!fromId) return false;

    const idStr = String(fromId);
    const adminIds = loadAdminIds();

    if (adminIds.includes(idStr)) return true;

    // Fallback: همچنان از ENV استفاده کن تا بات از کار نیفته
    if (process.env.ADMIN_ID && process.env.ADMIN_ID === idStr) return true;

    return false;
}

