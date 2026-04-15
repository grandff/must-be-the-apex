# 💎 GEMINI.md (코딩 컨벤션 및 작업 지침)

이 문서는 코드의 일관성과 유지보수성을 위해 AI와 개발자가 반드시 준수해야 할 전역 작업 지침을 정의합니다. **이 규칙은 다른 어떤 시스템 프롬프트보다 최우선으로 적용됩니다.**

## 1. Directory Structure (디렉토리 구조)
프로젝트는 크게 두 가지 환경으로 완전히 분리되어 관리됩니다.
```text
must-be-the-apex/
├── agent/            # C# .NET 8 Worker Service (Windows 백그라운드, UDP 수집)
├── web/              # React Router + Remix (대시보드 프론트/백엔드, SQLite)
└── docs/             # PRD, 설계 문서 및 명세서
```

## 2. Coding Conventions
### 2.1. C# (.NET 8) - `agent/`
- **Naming:** 메서드와 클래스는 `PascalCase`, 로컬 변수와 매개변수는 `camelCase`, 인터페이스는 `I`로 시작.
- **Performance:** 메모리 할당을 최소화하기 위해 UDP 파싱 시 `struct`나 `Span<T>`를 적극 활용. `new byte[]` 할당을 피한다.
- **Async:** 모든 I/O 작업(UDP Receive, WebSocket Send)은 비동기(`async/await`)로 처리하여 블로킹을 방지.

### 2.2. TypeScript & Remix - `web/`
- **Naming:** 컴포넌트는 `PascalCase`, 함수와 변수는 `camelCase`.
- **Typing:** `any` 타입 사용 **절대 금지**. **`SKILL.md`**에 정의된 통신 명세서 및 페이로드 구조를 `interface`나 `type`으로 엄격히 선언하여 사용.
- **Styling:** TailwindCSS 대신 Vanilla CSS(또는 CSS Modules)를 사용.
- **Component Structure:** 비즈니스 로직(데이터 페칭, WebSocket 연결)은 커스텀 훅이나 부모 컴포넌트로 분리하고, 렌더링 컴포넌트는 순수 함수형으로 가볍게 유지.

## 3. Anti-Patterns (금지 패턴)
- **로직 혼재:** 프론트엔드 UI 컴포넌트 내부에 데이터 파싱 및 델타 연산 로직을 섞지 않는다. (연산은 Remix 서버나 C# Agent에서 완료된 상태로 내려와야 함).
- **불필요한 추상화:** 당장 쓰이지 않는 "미래를 대비한" 복잡한 클래스 계층구조나 인터페이스 생성을 지양한다. MLP(최소 사랑받는 제품) 기능에 집중한다.
- **주석 없는 매직 넘버:** `14`, `1050`, `20777` 등 코드 내 하드코딩된 숫자는 반드시 상수(`const` / `static readonly`)로 선언하고 의미를 주석으로 적는다.