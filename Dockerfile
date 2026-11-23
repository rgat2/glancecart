# GlanceCart API + mock store + hosted funding page, one container. TESTNET ONLY.
FROM node:24-slim
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/mock-store/package.json apps/mock-store/
COPY apps/fund/package.json apps/fund/
COPY apps/glasses/package.json apps/glasses/
RUN pnpm install --frozen-lockfile --filter "@glancecart/api..." --filter "@glancecart/mock-store..." --filter "@glancecart/fund..."
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/mock-store ./apps/mock-store
COPY apps/fund ./apps/fund
COPY scripts ./scripts
RUN pnpm --filter @glancecart/fund exec vite build
ENV NODE_ENV=production PORT=8080 STATE_FILE=/data/state.json
EXPOSE 8080
CMD ["node", "scripts/start-prod.mjs"]
