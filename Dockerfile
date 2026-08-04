# 1. Builder Stage
FROM node:20-bookworm AS builder

WORKDIR /app

# C++ 네이티브 모듈 빌드를 위한 빌드 도구 설치
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Dependency 선설치 (캐싱 활용)
COPY package*.json ./
RUN npm ci

# 소스 코드 복사 및 프론트엔드 빌드 (Vite build)
COPY . .
RUN npm run build

# 2. Production Stage
FROM node:20-bookworm AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# C++ 네이티브 모듈(sqlite3) 실행 및 호환성을 위한 빌드 도구 설치
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Production 의존성 설치
COPY package*.json ./
RUN npm ci --only=production

# 빌드 결과물 및 서버 소스 복사
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server

# 데이터 보관용 디렉토리 생성
RUN mkdir -p /app/data

# Google Cloud Run 포트 노출
EXPOSE 8080

# 서버 실행
CMD ["npm", "start"]
