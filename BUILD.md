# 🏁 Must Be The Apex - Build Guide

## Prerequisites

### 공통
- Node.js 18+ (web/mock-agent)
- .NET 8 SDK (agent/csharp)

### Windows (Production)
- .NET 8 Runtime (if not self-contained)

---

## 1. Mock Agent (Node.js)

### 빌드 명령어
```bash
# 설치
cd agent/mock-agent
npm install

# 실행 (개발)
npm start

# 빌드 (패키징 - 나중에 Electron 등으로 변환 시)
npm run build
```

---

## 2. C# Agent (Windows)

### 빌드 명령어 (로컬)
```bash
cd agent/csharp

# 복원
dotnet restore

# 디버그 빌드
dotnet build

# 릴리즈 빌드
dotnet build -c Release

# AOT 자체 포함 실행 파일 퍼블리싱 (권장)
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o ./publish
```

### 출력 위치
```
agent/csharp/publish/
├── MustBeTheApex.Agent.exe  (단일 실행 파일)
└── (기타 зависи 파일)
```

### GitHub Actions에서 빌드하기
```bash
# CI/CD용 (workflow参照)
dotnet build -c Release
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o ./publish
```

---

## 3. Web (React Router / Remix)

### 빌드 명령어
```bash
cd web

# 설치
npm install

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build

# 단독 WebSocket 서버 실행 (別の 터미널)
npx tsx ws-server.ts

# 프로덕션 서버 실행
npm start
```

---

## 4. Docker (Web + SQLite)

### 빌드 명령어
```bash
cd web

# Docker 이미지 빌드
docker build -t must-be-the-apex-web .

# Docker 컨테이너 실행
docker run -d -p 3000:3000 -p 3001:3001 must-be-the-apex-web
```

---

## 5. GitHub Actions CI/CD

### C# Agent 빌드 workflow
```yaml
# .github/workflows/build-agent.yml
- name: Build .NET Agent
  run: |
    cd agent/csharp
    dotnet restore
    dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o ../publish/agent

- name: Upload Artifacts
  uses: actions/upload-artifact@v4
  with:
    name: agent-win-x64
    path: publish/agent/
```

### Web 빌드 workflow
```yaml
# .github/workflows/build-web.yml
- name: Build Web
  run: |
    cd web
    npm install
    npm run build

- name: Upload Artifacts
  uses: actions/upload-artifact@v4
  with:
    name: web-dist
    path: web/dist/
```

---

## 6. 윈도우 PC에서 실행하기

### 방법 A: GitHub Release에서 다운로드
1. Release 페이지에서 `MustBeTheApex.Agent-win-x64.zip` 다운로드
2. 압축 해제
3. `MustBeTheApex.Agent.exe` 실행

### 방법 B: Docker (Web만)
```powershell
docker run -d -p 3000:3000 -p 3001:3001 ghcr.io/<username>/must-be-the-apex-web:latest
```

---

## 7. 빠른 시작 명령어 요약

```bash
# ===== 전체 빌드 =====
# 1. Mock Agent
cd agent/mock-agent && npm install

# 2. C# Agent (Publish)
cd agent/csharp
dotnet restore
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o ./publish

# 3. Web
cd web && npm install && npm run build

# ===== 실행 =====
# WebSocket 서버
cd web && npx tsx ws-server.ts

# Mock Agent (테스트용)
cd agent/mock-agent && npm start

# Web Dashboard
cd web && npm start
```

---

## 8. 출력 디렉토리 구조

```
must-be-the-apex/
├── agent/
│   ├── csharp/
│   │   └── publish/           # MustBeTheApex.Agent.exe
│   └── mock-agent/
│       └── package.json
└── web/
    ├── dist/                  # 프로덕션 빌드 출력
    └── Dockerfile
```

---

## 9. 문제 해결

### dotnet not found
- [.NET 8 SDK 설치](https://dotnet.microsoft.com/download/dotnet/8.0)

### WebSocket 연결 실패
- 포트 3001 사용 중인지 확인: `lsof -i :3001`
- 방화벽 설정 확인

### SQLite 에러
- `data/` 디렉토리 쓰기 권한 확인