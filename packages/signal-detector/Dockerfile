FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/signal-detector/package.json ./packages/signal-detector/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/signal-detector ./packages/signal-detector
RUN pnpm --filter @ogasci/shared build
RUN pnpm --filter @ogasci/signal-detector build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/signal-detector/dist ./packages/signal-detector/dist
COPY --from=build /app/packages/signal-detector/package.json ./packages/signal-detector/
COPY --from=deps /app/node_modules ./node_modules
CMD ["node", "packages/signal-detector/dist/index.js"]
