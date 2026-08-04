# 1. Builder Stage
FROM node:20-bookworm AS builder

WORKDIR /app

# C++ 네이티브 모듈 빌드를 위한 필수 패키지 설치
RUN apt-get update && apt-get install -y python3 make g++ libsqlite3-dev && rm -rf /var/lib/apt/lists/*

# Dependency 선설치 및 sqlite3 소스 컴파일 지정
COPY package*.json ./
RUN npm ci --build-from-source=sqlite3

# 소스 코드 복사 및 프론트엔드 빌드 (Vite build)
COPY . .
RUN npm run build

# 2. Production Stage
FROM node:20-bookworm AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Production 환경에 C++ 빌드 도구 및 sqlite3 라이브러리 설치
RUN apt-get update && apt-get install -y python3 make g++ libsqlite3-dev && rm -rf /var/lib/apt/lists/*

# Production 의존성 설치 및 현재 컨테이너 GLIBC 환경에 맞춰 sqlite3 소스 직접 빌드
COPY package*.json ./
RUN npm ci --only=production --build-from-source=sqlite3

# 빌드 결과물 및 서버 소스 복사
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server

# 데이터 보관용 디렉토리 생성
RUN mkdir -p /app/data

# Google Cloud Run 포트 노출
EXPOSE 8080

# 서버 실행
CMD ["npm", "start"]
