# Build the TypeScript sources (this stage has all dev dependencies, incl. the MongoDB driver used by
# scripts/migrate-to-sqlite.js --from-mongo: `docker build --target build -t bbl-build .`).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json app.ts ./
COPY src ./src
RUN npx tsc

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production SQLITE_PATH=/data/bilibili_blacklist.db
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./
COPY html ./html
COPY scripts ./scripts
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "build/app.js"]
