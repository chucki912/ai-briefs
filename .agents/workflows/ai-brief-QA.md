---
description: AI Daily Briefs QA 및 검증 워크플로우
---

# 🧪 AI Briefs QA (생성 및 검증) 워크플로우

이 워크플로우는 AI 일일 단신 뉴스(AI Daily Briefs)의 `generate` 엔드포인트를 강제로 구동하고, 결과물이 화면에 출력되기 전에 생성된 JSON 전문을 확인하여 파싱 오류나 프롬프트 이탈이 없는지 검증하는 방법을 기술합니다. 

프롬프트를 수정하거나 모델을 변경할 때마다 반드시 이 워크플로우를 거쳐야 합니다.

## Step 1. 로컬 환경 백그라운드 서버 구동
- 터미널을 열고 애플리케이션 빌드 및 실행(dev mode)을 백그라운드로 띄워야 합니다.
- **실행 명령어:** `npm run dev` (이미 띄워져 있다면 이 단계는 패스합니다.)

## Step 2. 브리프 강제 생성 (API 호출)
기본적으로 브리프는 스케줄링되어 있거나 이미 생성된 경우 스킵되지만, `force: true` 파라미터를 주어 강제 재생성 프로세스를 태웁니다.
- **실행 명령어:** `curl -X POST http://localhost:3000/api/generate -H "Content-Type: application/json" -d '{"force":true}'`
- 주의: 생성 시간은 뉴스 수집 및 추론 시간에 따라 수십 초 ~ 1분이 넘게 소요될 수 있습니다. 터미널 창(Step 1)에서 로그가 완료될 때까지 대기합니다.

## Step 3. 생성된 데이터 (Redis) 즉시 검증
`src/lib/gemini.ts`의 프롬프트나 파싱 로직을 수정했다면, UI를 띄우기 전에 DB(Redis 캐시)에 어떤 형태의 JSON 객체가 들어갔는지 먼저 터미널에서 스크립트로 찍어보는 것이 좋습니다.

다음 스크립트를 `test-store.ts` 파일로 생성 후 실행하여 확인합니다. (또는 터미널 원격 명령 실행)

```typescript
import { getBriefByDate } from './src/lib/store';
// 오늘 날짜 기준 (YYYY-MM-DD 형식을 맞춰줍니다)
getBriefByDate('2026-03-02').then(res => {
  if(res && res.issues.length > 0) {
    console.log(JSON.stringify(res.issues[0], null, 2));
  } else {
    console.log("Not found or generating...");
  }
}).catch(console.error);
```
- **실행 명령어:** `npx tsx test-store.ts`

### 🔍 JSON 검증 체크리스트
출력된 JSON을 보고 다음 항목들을 점검하세요:
1. `singleTopicStatement`가 존재하는가?
2. `excludedFacts` 배열에 팩트가 존재하는가?
3. `keyFacts` 배열의 각 문자열 끝에 `| 메커니즘:` 텍스트가 묻어나오지 않고 깔끔하게 제거(Trim)되었는가?
4. `keyFacts` 내 수치 정보에 괄호 출처 및 시점/신뢰도가 명시되어 있는가?
5. `insight` 문단에 "※ trade-off" 같은 기계적인 괄호 텍스트나 직접적인 행동 지시(~하라)가 배제되어 있는가?
6. `soWhat` 필드가 4분 구조(`ifTrue`, `uncertain`, `bet`, `downside`)를 갖추어 각각 완성형 1문장으로 출력되는가?

### 🔍 리포트(Deep Dive/주간/통합) 검증 체크리스트
생성된 마크다운 리포트를 열고 다음 항목을 확인하세요:
1. Key Developments 내 `[Strategic Analysis]` 하단에 `(Basis: ...)` 형태의 기계적 꼬리표 라벨이 붙지 않고 본문으로 자연스럽게 녹아들었는가?
2. `## ■ Watchlist` 항목마다 `(폐기 트리거)` 조건이 1줄씩 의무적으로 명시되었는가?
3. Risks & Uncertainties 섹션의 위험 라벨이 Title Case(`[Tech]/[Market]/[Reg]`)로 통일되었는가?

## Step 4. UI 렌더링 확인
위의 JSON이 완벽하다면 비로소 웹 브라우저 (http://localhost:3000)를 띄우고 UI 렌더링 시 디자인 오류나 텍스트 짤림이 없는지 육안으로 최종 확정합니다.
