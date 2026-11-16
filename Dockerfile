# ---- Qurish ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
RUN npm ci
COPY . .
RUN npm run build -w server && npm run build -w web

# ---- API ----
FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev -w server && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY server/migrations server/migrations
WORKDIR /app/server
# Bemor fayllari uchun papka (docker volume shu egalik bilan yaratiladi)
RUN mkdir -p /data/files && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]

# ---- Veb (Caddy: statik fayllar + HTTPS + /api proksi) ----
FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/web/dist /srv
