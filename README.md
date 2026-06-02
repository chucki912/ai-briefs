# AI Daily Brief

매일 자동으로 글로벌 AI 산업 뉴스를 수집하고, 분석하여 한국어 브리핑 리포트를 생성하는 완전 자동화 웹 서비스입니다.
또한 배터리 산업 전문 분석, 주간 트렌드 리포트 등 다층적 인사이트를 제공합니다.

## ✨ 주요 기능

- **뉴스 수집**: RSS 피드 + Brave Search + Tavily Search (최신 24시간 필터링)
- **AI 분석**: Gemini API 기반 다각적 관점 분석 및 인사이트 생성
- **배터리 산업 전문**: K-Battery 생태계 중심의 심층 분석
- **주간 종합 리포트**: 클러스터링 기반 구조적 인사이트
- **웹 UI**: 다크/라이트 모드, 반응형, Pretendard 폰트
- **자동 스케줄**: 매일 오전 7시(KST) 자동 생성
- **트렌드 리포트**: Google Search 연동 심층 분석
- **로깅 & 분석**: 사용자 활동 추적

## 🚀 시작하기

### 1. 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.local` 파일 생성 (필수 및 선택항목):

```bash
# === 필수 ===
GEMINI_API_KEY=your_gemini_api_key              # Google Generative AI API 키 (https://aistudio.google.com)

# === 뉴스 수집 (선택) ===
BRAVE_SEARCH_API_KEY=your_brave_api_key         # Brave Search API 키
TAVILY_API_KEY=your_tavily_api_key              # Tavily Search API 키

# === 데이터 저장소 ===
# 로컬 개발: 파일시스템 (data/briefs 디렉토리)
# 프로덕션: Vercel KV (자동 감지) 또는 Redis
REDIS_URL=redis://...                           # Redis URL (선택)
REDIS_PREFIX=ai_brief                           # Redis 키 접두사 (기본값: ai_brief)

# === 보안 ===
CRON_SECRET=your_cron_secret                    # Cron 스케줄러 인증 키 (선택)

# === 기타 ===
VERCEL_OIDC_TOKEN=...                          # Vercel 배포용 (자동 생성)
```

> 💡 **API 키 발급**:
> - [Google AI Studio](https://aistudio.google.com) - Gemini API (무료)
> - [Brave Search API](https://api.search.brave.com) - 뉴스 검색 (유료)
> - [Tavily Search](https://tavily.com) - 추가 뉴스 수집 (유료)

### 3. 개발 서버 실행

```bash
npm run dev
```

http://localhost:3000 접속

### 4. 브리핑 생성

#### 웹 UI에서:
- 메인 페이지에서 "브리핑 생성하기" 버튼 클릭

#### API 호출:
```bash
# AI 산업 브리핑 생성
curl -X POST http://localhost:3000/api/generate

# 배터리 산업 브리핑 생성
curl -X POST http://localhost:3000/api/battery/generate

# Cron Secret 설정 시 인증
curl -X POST http://localhost:3000/api/generate \
  -H "Authorization: Bearer $CRON_SECRET"
```

## 📁 프로젝트 구조

```
src/
├── app/
│   ├── page.tsx                    # 메인 (오늘의 AI 브리핑)
│   ├── archive/page.tsx            # 아카이브 (과거 브리핑)
│   ├── battery/page.tsx            # 배터리 산업 브리핑
│   ├── battery/archive/page.tsx    # 배터리 아카이브
│   ├── admin/
│   │   ├── page.tsx                # 관리 대시보드
│   │   └── logs/page.tsx           # 활동 로그
│   └── api/
│       ├── generate/route.ts       # POST: AI 브리핑 생성
│       ├── brief/route.ts          # GET: AI 브리핑 조회
│       ├── battery/
│       │   ├── generate/route.ts   # POST: 배터리 브리핑 생성
│       │   ├── brief/route.ts      # GET: 배터리 브리핑 조회
│       │   └── trend-report/
│       │       ├── route.ts        # POST: 배터리 트렌드 리포트 생성
│       │       └── status/route.ts # GET: 생성 상태 조회
│       ├── weekly-report/
│       │   ├── route.ts            # POST: 주간 리포트 생성
│       │   └── status/route.ts     # GET: 생성 상태 조회
│       ├── trend-report/
│       │   ├── route.ts            # POST: AI 트렌드 리포트 생성
│       │   └── status/route.ts     # GET: 생성 상태 조회
│       ├── reports/generate/route.ts    # POST: 심층 리포트 생성
│       ├── cart/request/route.ts        # POST: 장바구니 요청
│       ├── log/route.ts                 # POST: 활동 로그 기록
│       └── admin/
│           ├── logs/route.ts            # GET: 로그 조회
│           └── cart-requests/route.ts   # GET: 카트 요청 조회
├── lib/
│   ├── collectors/
│   │   ├── news-fetcher.ts              # RSS + 뉴스 검색 수집
│   │   ├── battery-news-fetcher.ts      # 배터리 산업 뉴스 수집
│   │   └── source-config.ts             # 뉴스 소스 설정
│   ├── analyzers/
│   │   └── framework-matcher.ts         # AI 프레임워크 매칭
│   ├── generators/
│   │   └── report-builder.ts            # 리포트 빌드
│   ├── gemini.ts                        # Gemini API (AI 분석)
│   ├── battery-gemini.ts                # Gemini API (배터리 분석)
│   ├── weekly-report.ts                 # 주간 리포트 생성
│   ├── reports.ts                       # 심층 리포트 생성
│   ├── store.ts                         # 데이터 저장소 (Vercel KV / Redis / FS)
│   ├── logger.ts                        # 로깅
│   └── gemini-models.ts                 # Gemini 모델 상수 관리
├── components/
│   ├── IssueCard.tsx
│   ├── BriefCart.tsx
│   ├── TrendReportModal.tsx
│   ├── ThemeToggle.tsx
│   ├── ManualSourceInput.tsx
│   ├── ArchiveListView.tsx
│   └── Providers.tsx
├── contexts/
│   ├── AuthContext.tsx
│   └── BriefCartContext.tsx
├── types/
│   └── index.ts
└── configs/
    └── battery.ts                      # 배터리 산업 설정

scripts/
├── scheduler.ts                        # 일일 브리핑 생성 스케줄러
├── inspect-kv.ts                       # Vercel KV 데이터 검사
├── migrate-local-data.ts               # 데이터 마이그레이션
└── test-deduplication.ts               # 중복 제거 테스트

data/
├── briefs/                             # 생성된 브리핑 (로컬)
├── kv/                                 # KV 데이터 (로컬)
└── logs/                               # 활동 로그 (로컬)
```

## 📰 주간 AI 단신 생성기 (`/weekly-flash`)

LG경영연구원 리서처가 버튼 한 번으로 **최근 1주일 AI 산업 주요 이슈**를 CEO 보고용 단신 메모로 생성·검토·내보내기 하는 내부 도구입니다. 기존 데일리 브리핑(RSS 수집 기반)과 독립된 모듈이며, **실시간 웹 검색(Gemini + Google Search grounding)** 으로 그 자리에서 뉴스를 확보합니다.

### 사용 방법

1. 개발 서버 실행 후 http://localhost:3000/weekly-flash 접속
2. (선택) 기준일 입력 — 비우면 서버의 오늘 날짜(KST) 사용
3. 검색 확장 토글 선택 — **D-7**(기본) / **D-14**(보완 확장)
4. **단신 생성** 클릭 → 단신 3꼭지 + 종합 시사점 카드로 표시
5. **복사 / Markdown / PDF(인쇄)** 로 내보내기

생성 이력은 브라우저 세션 동안만 React state 로 보관됩니다(서버 DB 미사용).

### 동작 사양 (가드레일)

- **사실성**: 모델이 반환한 출처 링크를 **그대로** 표시하며, 앱이 링크를 생성·보정하지 않습니다. 링크가 없거나 "미확인"인 항목은 **배지**로 표시해 검증을 유도합니다.
- **정직한 건수**: 선정 기준을 충족하는 뉴스가 3건 미만이면 억지로 채우지 않고 `기준 충족 뉴스 N건` + `[기준 외 확장]` 표기로 정직하게 출력합니다.
- **API 키 보호**: `GEMINI_API_KEY` 는 서버 라우트(`/api/weekly-flash`)에서만 사용되며 클라이언트 번들에 포함되지 않습니다.
- 결과 하단 고정 안내: *"본 메모는 자동 생성 초안임. 수치·출처는 발행 전 반드시 원문 확인 필요."*

### 모델 / 검색 도구 설정

| 환경변수 | 설명 | 기본값 |
| --- | --- | --- |
| `GEMINI_API_KEY` | (필수) 서버 전용 Gemini API 키 | — |
| `WEEKLY_FLASH_MODEL` | 단신 생성 모델. grounding(웹 검색) 지원 모델 지정 | `gemini-3.1-pro-preview` |

웹 검색은 Gemini grounding(`tools: [{ googleSearch: {} }]`)으로 수행됩니다.

> 참고: 원본 사양은 Anthropic Messages API의 `web_search` 도구를 전제했으나, 본 프로젝트의 기존 스택과 일관성을 위해 Gemini grounding 으로 구현했습니다(시스템 프롬프트는 사양 전문 그대로 유지).

### 관련 파일

```
src/app/weekly-flash/page.tsx          # 메인 UI
src/app/api/weekly-flash/route.ts      # 서버 전용 LLM 호출 (재시도/타임아웃)
src/lib/weekly-flash/prompt.ts         # 시스템 프롬프트 상수 (사양 전문)
src/lib/weekly-flash/gemini.ts         # Gemini grounding 호출
src/lib/weekly-flash/parse.ts          # 메모 텍스트 → 구조화 파서
src/lib/weekly-flash/export.ts         # 복사 / MD / PDF 내보내기
src/lib/weekly-flash/types.ts          # 타입 정의
src/components/weekly-flash/           # FlashCard, SummaryBox, Toolbar, ExportBar, Skeleton
```

### Vercel 배포

기존 배포와 동일합니다(`vercel --prod` 또는 GitHub 연동). 배포 환경의 **Environment Variables** 에 `GEMINI_API_KEY` (필수)와 `WEEKLY_FLASH_MODEL` (선택)을 등록하면 됩니다. grounding 검색에 시간이 필요하므로 라우트는 `maxDuration = 120` 으로 설정되어 있습니다.

## 📊 Gemini 모델 설정

프로젝트는 다음 두 가지 Gemini 모델을 사용합니다:

| 상수명 | 모델 | 용도 |
|--------|------|------|
| `FLASH_MODEL` | `gemini-3.5-flash` | 빠른 분석 (뉴스 분석, 클러스터링) |
| `PRO_MODEL` | `gemini-3.1-pro-preview` | 심층 분석 (트렌드 리포트, 심층 분석) |

### 모델 검증

```bash
npm run check:gemini
```

상세 가이드는 [GEMINI_MODELS_GUIDE.md](GEMINI_MODELS_GUIDE.md) 참고

## 🔧 스케줄러 실행

매일 오전 7시(KST) 자동 AI 브리핑 생성:

```bash
npm run scheduler
```

**배포 환경**: Vercel Cron으로 자동 실행 (vercel.json 설정 참고)

## 📊 데이터 저장소

프로젝트는 환경에 따라 자동으로 스토리지를 선택합니다:

| 환경 | 저장소 | 특징 |
|------|--------|------|
| **Vercel 프로덕션** | Vercel KV | Redis 호환, Serverless 최적화 |
| **Redis 설정** | Redis | KV_URL 또는 REDIS_URL 환경변수 |
| **프로덕션 (설정 없음)** | 인메모리 | 재시작 시 데이터 손실 |
| **로컬 개발** | 파일시스템 | `data/` 디렉토리에 JSON 저장 |

**저장소 선택 로직** (`src/lib/store.ts`):
```typescript
1. Vercel KV (KV_REST_API_URL + KV_REST_API_TOKEN)
2. Redis (KV_URL 또는 REDIS_URL)
3. 프로덕션 환경 - 인메모리 (설정 없을 시)
4. 로컬 개발 - 파일시스템
```

## 🛠 기술 스택

- **Frontend**: React 19, Next.js 16 (App Router)
- **Language**: TypeScript
- **LLM**: Google Gemini API
- **Data Storage**: 
  - **프로덕션**: Vercel KV (Redis 기반)
  - **로컬**: 파일시스템 (JSON)
- **News Collection**: RSS Parser, Brave Search, Tavily Search
- **Task Scheduler**: node-cron
- **UI**: React Markdown, Pretendard 폰트
- **Deployment**: Vercel (Next.js 최적화)

## 📝 라이선스

MIT License

