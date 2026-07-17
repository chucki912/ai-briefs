// Deep Dive 검증 게이트 튜닝 파라미터. 동작 조정은 이 파일의 값만 변경할 것 — 로직 본체에 매직 넘버 금지.
export const TRIANGULATION_CONFIG = {
    MIN_INDEPENDENT_DOMAINS: 3,   // 입력 소스 제외 신규 도메인 최소 개수
    MAX_REGEN_ATTEMPTS: 2,        // 미달 시 재생성 최대 횟수
    FAIL_MODE: 'tag' as 'tag' | 'reject',
    // 'tag': 최종 미달 시에도 리포트는 반환하되 depthWarning 부착
    // 'reject': 최종 미달 시 null 반환
    // 향후 확장 자리 (지금은 사용하지 않음, 구현 금지):
    // AGGREGATOR_DENYLIST: [],   // 출처 티어링 (별도 태스크)
    // STORY_CLUSTERING: false,   // 동일 스토리 재보도 클러스터링 (별도 태스크)
};

// Deep Dive 내용 게이트(판단 완결성) — triangulation(검색 깊이)과 별개 축
export const CONTENT_GATE_CONFIG = {
    MAX_PASS2_RETRIES: 2,        // 게이트 실패 시 구조화(pass 2) 재시도 횟수
    MAX_PASS1_RERUNS: 1,         // pass 2 소진 후 전체(pass 1부터) 재실행 횟수
    MIN_WATCHLIST_ITEMS: 2,
    MIN_KEY_DEVELOPMENTS: 2,
    MIN_RISKS: 1,                // 스펙: domain 3종 전수는 요구하지 않음, 최소 1개
    FAIL_MODE: 'tag' as 'tag' | 'reject',
};

// 전역 예산: triangulation 재생성과 content gate의 pass 1 재실행을 합산한
// pass 1 총 실행 횟수 상한 (비용·지연 폭주 방지, e2e 600초 초과 실측 반영)
export const GLOBAL_BUDGET = {
    MAX_TOTAL_PASS1_RUNS: 4,
};

// 출처 티어링 — denylist 방식(allowlist 아님). 오차단이 미차단보다 나쁘므로
// 실측 관측 + 유형이 명백한 것만 신중히 추가할 것. 서브도메인 포함 매칭(registrable domain 기준).
export const SOURCE_TIERING = {
    AGGREGATOR_DENYLIST: [
        'intellectia.ai',       // AI 주식 리서치 집계/리라이팅
        'mlq.ai',               // AI 뉴스 집계
        'cryptobriefing.com',   // 크립토 집계·리라이팅
        'dailyforex.com',       // e2e 실측(3a): anchor 출처로 등장한 FX 집계 사이트
        'biyapay.com',          // e2e 실측(3a): anchor 출처로 등장한 결제/리서치 리라이팅
        'tradethepool.com',     // e2e 실측(3b): anchor 출처로 등장한 트레이딩 블로그
    ],
    // DENYLIST 후보 관측 대장 (2회 이상 관측 시 승격 검토 — 승격은 별도 결정, 자동 추가 금지):
    // tradingkey.com — 2026-07-17 anchor 출처로 1회 관측
    // getpanto.ai — 2026-07-17 grounding 출처로 2회 관측 (3a·티어링 e2e) → 승격 검토 대상
    // valueaddvc.com — 2026-07-17 grounding 출처로 2회 관측 (3a·품질패치 e2e) → 승격 검토 대상
    // moomoo.com, sqmagazine.co.uk, finpulse.dev — 2026-07-17 grounding 출처로 각 1회 관측
    // aibusinessweekly.net, tisram.ai, mindstudio.ai, appeconomyinsights.com — 2026-07-17 e2e grounding 출처로 각 1회 관측
    EXCLUDE_DENYLISTED_FROM_TRIANGULATION: true,  // 독립 도메인 카운트에서 제외
    ENFORCE_ANCHOR_TIER: true,                    // anchor 출처 denylist 차단
};

// 무검색 산출 방어 — grounding 청크 0인 리포트는 tag 모드여도 출고 금지 (3b e2e 정책 구멍 실측)
export const GROUNDING_POLICY = {
    REQUIRE_ANY_GROUNDING: true,
};
