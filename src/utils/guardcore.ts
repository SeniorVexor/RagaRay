// src/utils/guardcore.ts
export const createUserOnPanel = async (config: {
    username: string;
    traffic: number;      // GB
    expiryDays: number;
    inboundId: number;
    serverId?: number;
}) => {
    const response = await fetch(`${process.env.GUARDCORE_API}/user/create`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.GUARDCORE_TOKEN}` },
        body: JSON.stringify(config)
    });

    return response.json(); // { uuid, subUrl, configLink }
};