# Revocable Auth Boilerplate

> **Next.js 16 + Auth.js v5 + Prisma + PostgreSQL** 기반의, **강제 로그아웃이 가능한** 풀스택 인증 보일러플레이트.

`Credentials`(이메일+비밀번호)와 `Google OAuth`를 하나의 일관된 세션 모델로 묶고, 모든 세션을 PostgreSQL의 `Session` 테이블에 저장합니다. 운영자가 row 한 줄 지우는 것만으로 즉시 강제 로그아웃이 가능합니다.

---

## 목차

1. [무엇을 위한 보일러플레이트인가](#무엇을-위한-보일러플레이트인가)
2. [기술 스택](#기술-스택)
3. [핵심 설계](#핵심-설계)
4. [데이터 모델](#데이터-모델)
5. [디렉토리 구조](#디렉토리-구조)
6. [로컬 개발 환경 셋업](#로컬-개발-환경-셋업)
7. [데모 시나리오](#데모-시나리오)
8. [강제 로그아웃](#강제-로그아웃)
9. [환경 변수](#환경-변수)
10. [자주 쓰는 스크립트](#자주-쓰는-스크립트)
11. [의도적으로 다루지 않는 것](#의도적으로-다루지-않는-것)
12. [부록 A — Google API 호출이 필요해졌을 때](#부록-a--google-api-호출이-필요해졌을-때)

---

## 무엇을 위한 보일러플레이트인가

대부분의 Next.js 인증 예제는 **JWT stateless 세션**을 가정합니다. JWT는 빠르고 단순하지만 한 가지 큰 단점이 있습니다 — **회원 탈퇴, 권한 회수, 비정상 활동 감지 시 즉시 로그아웃이 불가능**합니다. JWT는 서버에 토큰 사본이 없기 때문에 만료될 때까지 유효합니다.

이 보일러플레이트는 그 문제를 해결합니다.

- **모든 세션이 DB row 1개에 1:1 대응**
- **강제 로그아웃 = `DELETE FROM "Session" WHERE ...` 한 줄**
- 그러면서도 표준 Auth.js의 자동화 흐름(adapter, 콜백, 라우트 핸들러)을 거의 그대로 사용
- Credentials와 OAuth가 **동일한 세션 형식**을 공유 (쿠키 값, 갱신 로직, 만료 정책 모두 통일)

"세션을 회수할 수 있다(revocable)"는 단 하나의 요구를 깔끔하게 충족하는 것이 이 프로젝트의 목적입니다.

---

## 기술 스택

| 영역 | 사용 기술 | 버전 / 선택 이유 |
|---|---|---|
| 프레임워크 | **Next.js** | 16.x (App Router, Turbopack) |
| 언어 | TypeScript | strict |
| 인증 | **Auth.js (next-auth)** | v5 beta — `auth()` 헬퍼와 새로운 adapter 인터페이스가 본 설계의 전제 |
| Adapter | **`@auth/prisma-adapter`** | 표준 adapter를 wrapping해서 sliding window + 토큰 strip 주입 |
| ORM | **Prisma** | 6.x — 마이그레이션 도구 포함, adapter 공식 지원 |
| DB | **PostgreSQL** | 16 (로컬은 Docker, prod은 Neon/Supabase 등 자유) |
| 해싱 | **bcryptjs** | 비밀번호 해시 (Edge runtime 호환을 위해 `bcrypt` 대신 `bcryptjs`) |
| 검증 | **zod** | 서버 액션 입력 검증 |
| ID 생성 | **uuid** | 세션 토큰 발급 |
| 패키지 매니저 | **Yarn 1.x** | npm/pnpm으로 교체 가능 |

---

## 핵심 설계

### 1. 강제 로그아웃 가능한 server-side session

Auth.js v5의 `database` strategy를 사용합니다. 모든 세션은 `Session` 테이블의 row로 존재하며, 클라이언트 쿠키에는 **세션 토큰(UUID 문자열)** 만 들어갑니다 — JWT가 아닙니다.

```
Cookie: authjs.session-token=8f3a...uuid...
                                ↓ adapter.getSessionAndUser() lookup
Postgres "Session" row → 인증 통과
```

운영자는 다음 한 줄로 즉시 로그아웃을 강제할 수 있습니다.

```sql
DELETE FROM "Session" WHERE "userId" = '...';
```

다음 요청부터 그 사용자는 인증 실패 → 자동으로 `/login`으로 리다이렉트됩니다.

### 2. Credentials와 OAuth를 하나의 세션 모델로 통합

Auth.js v5에서 `Credentials` provider는 본래 JWT strategy 전용이고, `database` strategy와 충돌합니다. 이 충돌은 **`jwt.encode` override** 로 해소합니다.

```ts
jwt: {
  async encode(params) {
    if (params.token?.credentials) {
      // Credentials 로그인 → 직접 sessionToken을 발급해서
      // adapter.createSession()으로 DB에 INSERT, 쿠키 값으로 반환
      const sessionToken = uuidv4();
      await adapter.createSession!({
        sessionToken,
        userId: params.token.sub!,
        expires: new Date(Date.now() + SESSION_MAX_AGE_MS),
      });
      return sessionToken;
    }
    return defaultEncode(params);   // OAuth는 표준 흐름
  },
}
```

결과적으로:
- **OAuth 로그인** → adapter가 자동으로 Session row INSERT
- **Credentials 로그인** → 우리가 수동으로 동일한 형식의 Session row INSERT

→ 쿠키 값, 만료 로직, 강제 로그아웃 SQL이 **양 provider 모두 동일**합니다.

### 3. 계정 ≠ 로그인 방법

한 명의 사용자(`User`)에 여러 로그인 방법(`Account`)이 N개 매달릴 수 있습니다.

- 같은 사람이 비밀번호로도, Google로도 로그인 가능
- `@@unique([userId, provider])`로 한 유저당 같은 provider 중복 연결 차단
- `/account` 페이지에서 사용자 본인이 추가 연결(Connect Google) / 해제(Disconnect) 가능
- 단, **마지막 로그인 방법은 해제 차단** — 잠금 방지

### 4. Sliding window 만료

세션 수명을 **두 단계**로 관리합니다.

```
SESSION_MAX_AGE_MS  = 30일 (절대 한도, refresh-equivalent)
IDLE_TIMEOUT_MS     = 1시간 (미활동 만료)
ACTIVITY_THROTTLE_MS = 1분  (lastActivityAt 갱신 throttle)
```

- 사용자가 활동하는 동안에는 1시간마다 `lastActivityAt`을 갱신해 세션을 살려둠
- 1시간 동안 아무 요청도 없으면 다음 접근 시 `getSessionAndUser`가 row를 삭제하고 null 반환 → 자동 로그아웃
- 30일이 지나면 사용 중이라도 무조건 만료
- **매 요청마다 `Session` row를 UPDATE하지 않도록** 1분 throttle 적용 (DB 부하 완화)

이 모든 로직은 `lib/auth/adapter.ts`의 `getSessionAndUser` override 한 곳에 모여 있습니다.

### 5. `getCurrentUser()` 추상화

페이지/route handler/server action 어디서든 **단 하나의 함수**로 현재 사용자 정보를 얻습니다.

```ts
import { requireUser } from '@/lib/auth/current-user';

export default async function ProtectedPage() {
  const user = await requireUser();   // 미인증 시 자동 /login 리다이렉트
  // user.id, user.email, user.name, user.source ('session' | 'api-token')
}
```

미래에 모바일 앱 / 외부 API 호출자를 위해 `Authorization: Bearer` 토큰 인증을 추가할 때, **호출처는 단 한 줄도 바꾸지 않고** 이 함수만 확장하면 됩니다. 그래서 `source` 필드가 시작부터 들어가 있습니다.

### 6. 단일 트랜잭션 회원가입 (no multi-step)

회원가입은 한 번의 server action 호출로 완료됩니다. 이메일 검증은 **데모용 버튼 한 번 클릭**으로 통과되는 형태로 들어가 있습니다 — 보일러플레이트는 인증 흐름의 **위치**만 보여주고, 실제 매직 링크/OTP 발송은 사용자가 자기 도메인에 맞게 구현합니다.

### 7. OAuth 계정 연결의 안전한 분기

OAuth 로그인 시 `signIn` 콜백이 다음 3분기를 처리합니다.

| 상황 | 처리 |
|---|---|
| 이미 연결된 OAuth 계정 | adapter가 자동 처리 → 즉시 로그인 |
| OAuth 이메일이 기존 사용자와 일치 | `/link-account`로 리다이렉트 (자동 병합 안 함) |
| 신규 이메일 | adapter가 자동으로 User + Account 생성 |

`allowDangerousEmailAccountLinking: false`로 설정해 **자동 병합을 막고**, 같은 이메일 충돌 시에는 명시적 본인 확인을 요구합니다.

`/link-account` 페이지는 두 경로:
- **이미 로그인 상태**(예: `/account`에서 "Connect Google" 클릭) → 단순 confirm만
- **로그아웃 상태**(OAuth로 들어왔는데 그 이메일이 기존 계정과 충돌) → 그 계정의 비밀번호 입력으로 본인 증명

---

## 데이터 모델

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  emailVerified DateTime?
  name          String?
  image         String?
  password      String?            // OAuth 단독 가입자는 NULL
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  accounts      Account[]
  sessions      Session[]
}

model Account {
  userId            String
  type              String         // 'credentials' | 'oidc' | 'oauth'
  provider          String         // 'credentials' | 'google' | ...
  providerAccountId String
  // OAuth 토큰 컬럼들 (현재 항상 NULL — 부록 A 참조)
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  createdAt         DateTime @default(now())
  user              User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([provider, providerAccountId])
  @@unique([userId, provider])     // 한 유저당 같은 provider 1개만
  @@map("account_providers")        // 의미 강조용 별칭
}

model Session {
  sessionToken   String   @id      // 쿠키 값과 동일
  userId         String
  expires        DateTime          // 절대 만료 (30일)
  lastActivityAt DateTime @default(now())   // sliding window 시드
  user           User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  @@unique([identifier, token])
}
```

표준 Auth.js adapter 스키마와 호환됩니다. 두 가지만 확장:
- **`Session.lastActivityAt`** — sliding window용
- **`Account @@unique([userId, provider])`** — 같은 provider 중복 연결 차단

---

## 디렉토리 구조

```
app/
  (auth)/                   # 비로그인 영역
    login/page.tsx
    signup/page.tsx
    link-account/
      page.tsx
      forms.tsx
  (app)/                    # 보호 영역 (requireUser)
    page.tsx                # 홈
    sign-out-button.tsx
    account/
      page.tsx              # 연결된 provider 관리
      buttons.tsx
  api/
    auth/[...nextauth]/route.ts
    admin/sessions/route.ts # 강제 로그아웃 데모
  layout.tsx
  globals.css

lib/
  db.ts                     # PrismaClient 싱글톤
  auth/
    index.ts                # NextAuth() 설정 — auth, signIn, signOut, handlers export
    adapter.ts              # wrapped PrismaAdapter (sliding window + token strip)
    constants.ts            # SESSION_MAX_AGE_MS 등
    current-user.ts         # getCurrentUser, requireUser
    provider-types.ts       # provider id → type ('oidc' | 'oauth') 매핑

server/
  actions/
    signup.ts               # signupAction
    link-account.ts         # linkOAuthToCurrentUser, linkOAuthWithPassword, disconnectProvider

prisma/
  schema.prisma
  seed.ts                   # 데모 유저
  migrations/

docker-compose.yml          # 로컬 Postgres
.env.example
```

---

## 로컬 개발 환경 셋업

### 사전 준비
- Node.js 20 이상
- Yarn 1.x (`brew install yarn` 또는 `npm i -g yarn`)
- Docker (로컬 Postgres용)

### 6단계 실행

```bash
# 1) Postgres 컨테이너 기동
docker compose up -d

# 2) 환경변수 템플릿 복사
cp .env.example .env

# 3) 의존성 설치 (Prisma client는 postinstall로 자동 생성됨)
yarn

# 4) DB 스키마 적용 (마이그레이션 이름 입력 프롬프트가 뜨면 'init' 추천)
yarn db:migrate

# 5) 데모 유저 시드 (선택)
yarn db:seed

# 6) 개발 서버
yarn dev
```

브라우저에서 <http://localhost:3000> 접속 → 보호된 홈이라 자동으로 `/login`으로 이동합니다.

### 데모 계정

`yarn db:seed` 실행 후:

- 이메일: `demo@example.com`
- 비밀번호: `demopass1`

### Google OAuth 활성화 (선택)

`.env`에 `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`이 비어 있으면 "Continue with Google" 버튼은 동작하지 않습니다.

활성화하려면:

1. <https://console.cloud.google.com/apis/credentials>에서 OAuth 2.0 Client ID 생성
2. **승인된 리디렉션 URI**에 `http://localhost:3000/api/auth/callback/google` 추가
3. Client ID/Secret을 `.env`에 붙여넣고 `yarn dev` 재시작

---

## 데모 시나리오

### A. 비밀번호로 회원가입 → 자동 로그인

1. <http://localhost:3000/signup>
2. 이메일 입력 → **"Verify email (demo)" 버튼 클릭** (체크 표시로 변환)
3. 비밀번호(8자 이상), 이름 입력 → "Create account"
4. 자동으로 `/`로 이동, 로그인 상태

### B. Google 신규 가입

1. `/login` 또는 `/signup`에서 "Continue with Google"
2. Google 동의 화면 → 우리 콜백 도착
3. (이메일 충돌 없으면) adapter가 자동으로 User + Account 생성, `/`로 이동

### C. 기존 계정에 Google 추가 연결

1. 비밀번호로 로그인된 상태에서 `/account`
2. "Connect Google" 클릭
3. Google OAuth → `signIn` 콜백이 "이메일 충돌(=본인)" 감지 → `/link-account`로 리다이렉트
4. "Confirm and link" 클릭 → 연결 완료, `/account`로 복귀

### D. 비로그인 상태에서 Google로 시도했는데 그 이메일이 이미 다른 가입 방법으로 존재

1. (로그아웃 상태) "Continue with Google"
2. Google OAuth 후 `/link-account`로 이동 — "그 이메일은 이미 가입돼 있습니다, 비밀번호로 본인 확인해주세요"
3. 비밀번호 입력 → 검증 통과 → Google 연결 → `signIn('google')` 재호출 → 로그인 완료

### E. 로그인 방법 해제

1. `/account`에서 어떤 provider 옆 "Disconnect"
2. 마지막 1개 남았을 땐 버튼이 비활성화됨 (잠금 방지)
3. credentials 해제 시 `User.password`도 NULL로 초기화

---

## 강제 로그아웃

### 운영자가 직접 (SQL)

```sql
-- 특정 유저의 모든 세션 무효화
DELETE FROM "Session" WHERE "userId" = '<USER_ID>';

-- 특정 세션 1개만
DELETE FROM "Session" WHERE "sessionToken" = '<TOKEN>';

-- 만료된 세션 일괄 정리 (cron 권장)
DELETE FROM "Session" WHERE "expires" < NOW();
```

### 데모용 admin route (개발 환경 전용)

```bash
curl -X DELETE http://localhost:3000/api/admin/sessions \
     -H 'content-type: application/json' \
     -d '{"userId":"<USER_ID>"}'
```

`NODE_ENV=production`에서는 자동 비활성화됩니다. 실 서비스에선 admin role 가드를 붙여 별도 운영자 페이지로 노출하는 것을 권장합니다.

---

## 환경 변수

`.env.example` 참조. 모든 키 한눈에:

| 키 | 용도 | 비고 |
|---|---|---|
| `DATABASE_URL` | Prisma → Postgres 연결 문자열 | 로컬 docker-compose 기본값 매칭 |
| `AUTH_SECRET` | Auth.js JWT/세션 서명 키 | prod에선 반드시 교체. `openssl rand -base64 32` |
| `AUTH_URL` | 콜백 URL 베이스 | 로컬은 `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` | Google OAuth | 비어두면 Google 버튼 비활성 |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | 동일 |

---

## 자주 쓰는 스크립트

| 명령 | 동작 |
|---|---|
| `yarn dev` | 개발 서버 (Turbopack) |
| `yarn build` | 프로덕션 빌드 |
| `yarn start` | 빌드 결과 실행 |
| `yarn lint` | ESLint |
| `yarn db:migrate` | 마이그레이션 적용 (dev 모드) |
| `yarn db:reset` | 스키마 drop & 재생성, 시드 자동 재실행 |
| `yarn db:seed` | 시드 스크립트 단독 실행 |
| `yarn db:studio` | Prisma Studio 기동 (<http://localhost:5555>) |

DB 내부를 들여다보고 싶으면 **`yarn db:studio`** 가 가장 빠릅니다. 모든 테이블, 관계, FK 따라가기까지 GUI로 즉시 가능.

---

## 의도적으로 다루지 않는 것

이 보일러플레이트는 **인증 시스템의 핵심 메커니즘**에만 집중합니다. 다음은 명시적으로 범위 밖:

- **이메일/SMS 소유권 증명** (실제 발송) — `/signup`의 "Verify (demo)" 버튼이 그 자리만 잡아둠
- **reCAPTCHA, rate limiting, 봇 방어**
- **멀티스텝 회원가입, 약관 동의 UX**
- **Refresh token 회전, 외부 API 토큰** (부록 A 참조)
- **Admin role / RBAC**
- **다국어, UI 라이브러리** — 인라인 스타일만 사용 (소비자가 자유롭게 교체)

각 항목이 필요해지면 위 핵심 위에 별도 레이어로 얹어 구현하는 것이 권장 패턴입니다.

---

## 부록 A — Google API 호출이 필요해졌을 때

> **현재 상태**: `Account` 테이블에 `access_token`, `refresh_token`, `id_token` 등의 컬럼이 존재하지만 **항상 NULL**입니다. 이 보일러플레이트는 OAuth를 신원 증명 용도로만 쓰고, Google API를 호출하지 않으므로 토큰 저장이 불필요합니다. `lib/auth/adapter.ts`의 `linkAccount` override가 토큰 필드를 제거하고 base adapter에 전달합니다.

만약 나중에 "사용자의 Google Calendar 일정 가져오기" 같은 기능이 필요해지면, 다음 5단계로 점진적 전환이 가능합니다.

### 1. adapter wrapper에서 토큰 strip 제거

`lib/auth/adapter.ts`의 `linkAccount` override를 삭제하거나 token strip 부분만 제거합니다. 그러면 신규 OAuth 사용자는 토큰이 정상적으로 저장됩니다.

### 2. Google provider config에 `offline_access` + `prompt=consent` 추가

`lib/auth/index.ts`:
```ts
Google({
  clientId: process.env.GOOGLE_CLIENT_ID ?? '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  authorization: {
    params: {
      access_type: 'offline',   // refresh_token 발급 요청
      prompt: 'consent',         // 매 sign-in마다 consent 강제 (refresh_token 안정 발급)
      scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly',
    },
  },
}),
```

> **왜 `prompt: 'consent'` 가 필수인가**: Google은 사용자가 "이미 동의한 적 있는 권한"에 대해 두 번째 sign-in부터 refresh_token을 안 줍니다. `prompt=consent`로 매번 consent 화면을 강제하면 refresh_token이 안정적으로 옵니다. UX 측면에서 약간 거슬리지만 백그라운드 API 호출의 신뢰성을 위해 필요합니다.

### 3. signIn 콜백에서 기존 사용자도 토큰 갱신

기존 사용자가 Google로 다시 로그인할 때 `account.linkAccount`는 호출되지 않습니다 (이미 연결돼 있으므로). 토큰을 fresh로 유지하려면 signIn 콜백에 한 줄 추가:

```ts
async signIn({ user, account, profile }) {
  // ... 기존 분기 로직 ...

  // 기존 OAuth 계정이면 매번 토큰 UPDATE
  if (account?.provider !== 'credentials' && existing) {
    await prisma.account.update({
      where: {
        provider_providerAccountId: {
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        },
      },
      data: {
        access_token:  account.access_token,
        refresh_token: account.refresh_token ?? undefined,
        expires_at:    account.expires_at,
        id_token:      account.id_token,
      },
    });
  }
  return true;
}
```

### 4. access_token 갱신 helper 작성

```ts
// lib/google/access-token.ts
export async function getValidGoogleAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findUnique({
    where: { userId_provider: { userId, provider: 'google' } },
  });
  if (!account?.access_token) return null;

  // 1분 여유로 유효성 체크
  if (account.expires_at && account.expires_at * 1000 > Date.now() + 60_000) {
    return account.access_token;
  }

  // 만료 → refresh_token으로 새 토큰 발급
  if (!account.refresh_token) return null;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type:    'refresh_token',
      refresh_token: account.refresh_token,
    }),
  });
  if (!r.ok) return null;
  const tokens = await r.json();

  await prisma.account.update({
    where: { userId_provider: { userId, provider: 'google' } },
    data: {
      access_token: tokens.access_token,
      expires_at:   Math.floor(Date.now() / 1000) + tokens.expires_in,
    },
  });
  return tokens.access_token;
}
```

호출 시:
```ts
const token = await getValidGoogleAccessToken(user.id);
if (!token) {
  // 사용자에게 "Google 재연결 필요" 안내
}
const calendar = await fetch('https://www.googleapis.com/calendar/v3/...', {
  headers: { Authorization: `Bearer ${token}` },
});
```

### 5. 기존 사용자에게 "Google 재연결 필요" 안내

위 변경 후, 기존에 이미 Google을 연결해놓은 사용자들은 `Account` row에 토큰이 비어 있는 상태입니다. **별도 데이터 마이그레이션은 필요 없습니다** — 그 사용자가 다음번 Google sign-in을 한 번 하면 3번 콜백이 자동으로 토큰을 채워 넣습니다.

UI에서 이를 유도하려면, Google API 호출이 필요한 페이지에서 토큰이 NULL이면 "Reconnect Google" 버튼을 노출하면 됩니다.

```tsx
const account = await prisma.account.findUnique({ ... });
if (!account?.refresh_token) {
  return <button onClick={() => signIn('google')}>Reconnect Google</button>;
}
```

---

## 라이선스

원하는 대로 자유롭게 사용 / 수정 / 재배포하세요. (LICENSE 파일은 사용처에서 추가 권장)
