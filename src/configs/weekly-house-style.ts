/**
 * 주간 트렌드 리포트 하우스 스타일 상수 — 사내 문서 1,306건 실측 기반.
 *
 * 프롬프트 인라인 금지(스펙). PASS 4 본문 생성과 PASS 7 DoD 검증이 이 단일 원천을 참조한다.
 * 임의 조정 금지 — 값 변경은 실측 재측정을 동반해야 한다.
 */

/** 글자수 규격(한글 문자 기준). */
export const LENGTH = {
    BODY_MIN: 1100,          // 스레드 본문(배경+주요내용) 합계
    BODY_MAX: 1500,          // 중앙 1,318
    IMPLICATION_MIN: 300,    // 시사점
    IMPLICATION_MAX: 450,    // 중앙 375
    IMPLICATION_RATIO_MIN: 0.20, // 시사점/본문 비율(중앙 23%)
    IMPLICATION_RATIO_MAX: 0.25,
} as const;

/** 구조 규격. */
export const STRUCTURE = {
    LABELS: ['[배경]', '[주요 내용]', '[시사점]'] as const, // 정형 3단(대괄호 표기 그대로)
    HEADER_MIN: 3,
    HEADER_MAX: 4,
    MAX_DEPTH: 2,
    MIN_DISTINCT_METRICS: 3, // 스레드당 서로 다른 수치
    MIN_TABLES: 1,           // 시점/대상 비교 표(단순 나열 금지)
} as const;

/**
 * 단락 기능 배합(상한·하한 강제). 단순서술 상한이 핵심 — 실측 32.8%지만 따라가면 요약체가 된다.
 * 비율은 전체 단락 중 해당 기능 단락의 비율.
 */
export const PARAGRAPH_MIX = {
    B4_NUMERIC_MIN: 0.15,    // 수치·근거
    B5_COMPARISON_MIN: 0.12, // 비교·대비
    B6_INTERPRET_MIN: 0.10,  // 해석·평가
    B7_OUTLOOK_MIN: 0.25,    // 전망·계획
    B7_OUTLOOK_MAX: 0.40,
    B2_CONTEXT_MIN: 0.08,    // 배경·맥락
    B9_PLAIN_MAX: 0.20,      // 단순서술 상한(초과 시 B5/B6로 재작성)
} as const;

/** 시사점 금지 어미(판단 회피형) — 이 어미로 끝나는 문장 금지. */
export const IMPLICATION_FORBIDDEN_ENDINGS = [
    '주목된다', '필요하다', '중요하다', '예의주시', '지켜봐야 한다', '관심이 필요하다',
] as const;

/** observedDates==1(단발) 항목 본문 금지어(트렌드 과대주장 방지). */
export const OVERCLAIM_FORBIDDEN = [
    '트렌드', '흐름', '추세', '본격화', '가속화', '전환점', '패러다임',
] as const;

/** 강등(단발 관측) 섹션에서도 금지되는 어휘. */
export const DEMOTED_FORBIDDEN = ['트렌드', '흐름', '추세', '조짐'] as const;
