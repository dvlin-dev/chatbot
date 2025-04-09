FROM node:18-alpine AS base

# 创建工作目录
WORKDIR /app

# 安装全局依赖
RUN npm install -g pnpm

# 复制 package.json 和 pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install

# 复制源代码
COPY . .

# 构建阶段
FROM base AS build


# 构建主应用
RUN pnpm run build

# 生产阶段
FROM node:18-alpine AS production

WORKDIR /app

# 安装全局依赖和 OpenSSL
RUN apk add --no-cache openssl

# 安装全局依赖
RUN npm install -g pnpm

# 复制 package.json 和 pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# 仅安装生产依赖，并确保安装 tslib
RUN pnpm install --prod && pnpm add tslib

# 从构建阶段复制编译后的代码
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# 复制配置文件
COPY .env* ./
COPY nest-cli.json ./

# 生成 Prisma 客户端
RUN npx prisma generate
RUN npx prisma migrate

# 暴露端口（主应用）
EXPOSE 3100

# 设置默认命令
CMD ["node", "dist/src/main.js"] 