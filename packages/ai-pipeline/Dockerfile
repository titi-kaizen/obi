FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/ai-pipeline/package.json ./packages/ai-pipeline/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/ai-pipeline ./packages/ai-pipeline
RUN pnpm --filter @ogasci/shared build
RUN pnpm --filter @ogasci/ai-pipeline build

FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/ai-pipeline/dist ./packages/ai-pipeline/dist
COPY --from=build /app/packages/ai-pipeline/package.json ./packages/ai-pipeline/
COPY --from=deps /app/node_modules ./node_modules

CMD ["node", "packages/ai-pipeline/dist/index.js"]
