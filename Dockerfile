# Build the TypeScript sources, then ship only the runtime dependencies.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json app.ts ./
COPY src ./src
RUN npx tsc && npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production SQLITE_PATH=/data/bilibili_blacklist.db
COPY --from=build /app/node_modules ./node_modules
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
