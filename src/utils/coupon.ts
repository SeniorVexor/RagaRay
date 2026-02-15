// src/utils/coupon.ts
export const validateCoupon = (code: string): {
    valid: boolean;
    discount?: number;  // percent
    maxUsage?: number;
} => {
    const coupons = {
        'WELCOME20': { discount: 20, maxUsage: 100 },
        'SUMMER30': { discount: 30, maxUsage: 50 },
        'REFERRAL10': { discount: 10, maxUsage: 1000 }
    };

    return coupons[code] || { valid: false };
};