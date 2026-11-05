# syntax=docker/dockerfile:1

# 构建阶段用 Node 22 LTS；npm 源可用 --build-arg NPM_REGISTRY=https://registry.npmmirror.com 加速
ARG NODE_VERSION=22-alpine
ARG NPM_REGISTRY=https://registry.npmjs.org

# ---------- 1. 安装全部依赖（含 devDependencies，用于编译） ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
ARG NPM_REGISTRY
COPY package.json package-lock.json ./
RUN npm config set registry "$NPM_REGISTRY" \
 && npm ci --no-audit --no-fund

# ---------- 2. 编译 TypeScript ----------
FROM node:${NODE_VERSION} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- 3. 运行时镜像（只留生产依赖 + dist） ----------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ARG NPM_REGISTRY
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm config set registry "$NPM_REGISTRY" \
 && npm ci --omit=dev --no-audit --no-fund \
 && npm cache clean --force

COPY --from=build /app/dist ./dist

# 以非 root 用户运行
USER node

EXPOSE 3000

# 容器自带健康检查：DB 挂了 /api/health 会返回 503，这里判非 2xx 即不健康
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
