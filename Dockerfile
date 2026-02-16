# syntax = docker/dockerfile:1

# مرحله ۱: پایه (base image) - سبک و جدید
FROM node:22-alpine AS base

# مرحله ۲: نصب وابستگی‌ها (deps) - برای کش بهتر
FROM base AS deps
WORKDIR /app

# فقط package.json و lock رو کپی کن تا کش وابستگی‌ها حفظ بشه
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile --prod=false  # همه وابستگی‌ها (dev + prod)

# مرحله ۳: ساخت و generate (builder)
FROM base AS builder
WORKDIR /app

# وابستگی‌ها رو از مرحله deps کپی کن
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma Client رو generate کن (مهم!)
RUN pnpm prisma generate

# پروژه TypeScript رو build کن
RUN pnpm build

# مرحله ۴: تصویر نهایی (runner) - خیلی سبک
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# کاربر غیر-root برای امنیت
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodeapp && \
    chown -R nodeapp:nodejs /app

# فقط فایل‌های لازم برای اجرا رو کپی کن
COPY --from=builder --chown=nodeapp:nodejs /app/dist ./dist
COPY --from=builder --chown=nodeapp:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodeapp:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nodeapp:nodejs /app/prisma ./prisma   # اگر schema.prisma نیاز داری
# اگر config/plans.json داری و در کد خونده می‌شه:
COPY --from=builder --chown=nodeapp:nodejs /app/config ./config

USER nodeapp

EXPOSE 3000

# اگر نیاز به migrate داری موقع startup اجرا می‌شه (اختیاری)
# CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]

# اجرای معمولی بات
CMD ["node", "dist/index.js"]