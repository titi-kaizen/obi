FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/scraper/package.json ./packages/scraper/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# Install Playwright Chromium + system deps
RUN npx playwright install-deps chromium
RUN npx playwright install chromium

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/scraper ./packages/scraper
RUN pnpm --filter @ogasci/shared build
RUN pnpm --filter @ogasci/scraper build

FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
# Playwright deps for Alpine
RUN apk add --no-cache \
  chromium \
  nss \
  freetype \
  harfbuzz \
  ca-certificates \
  ttf-freefont
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/scraper/dist ./packages/scraper/dist
COPY --from=build /app/packages/scraper/package.json ./packages/scraper/
COPY --from=deps /app/node_modules ./node_modules

CMD ["node", "packages/scraper/dist/index.js"]
