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

