# 1. Builder Stage
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Dependency 설치 및 프론트엔드 빌드
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# 2. Production Stage
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package*.json ./
RUN npm ci --only=production

# 빌드 결과물 및 서버 소스 복사
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server

EXPOSE 8080

CMD ["npm", "start"]
