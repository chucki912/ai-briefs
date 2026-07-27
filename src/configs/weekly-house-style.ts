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

/**
 * 정량 근거 정의 — DoD #7(distinct 수치)과 헤드라인 수치 선택이 공유하는 단일 원천.
 *
 * 인정: 단위(%, 원, 달러, GWh, 대, 건 등) 또는 규모(천/만/억/조, K/M/B)를 동반한 수치만.
 * 불인정: ISO 주차(2026-W30)·연도(2026년)·날짜(2026-07-20)·버전(v1.2)·일련번호.
 * 이유: "2026-W23" 같은 시점 표기가 수치로 계수되면 정량 근거형 보증이 거짓 통과한다.
 */
// 시점/버전 표기 — 정량 수치에서 제외(먼저 제거).
const NON_METRIC_PATTERNS: RegExp[] = [
    /\d{4}-W\d{2}/g,                 // ISO 주차
    /\d{4}-\d{2}-\d{2}/g,            // 날짜(YYYY-MM-DD)
    /\d{4}-\d{2}(?!\d)/g,            // 연-월
    /(?:19|20)\d{2}\s*년/g,          // 연도(2026년)
    /(?:19|20)\d{2}(?![\d.])/g,      // 4자리 연도 단독
    /\bv?\d+\.\d+(?:\.\d+)+\b/gi,    // 버전 x.y.z
];
// 단위/규모 동반 수치. 캘린더 단위(년/분기/주간)는 제외.
const QUANT_UNIT = String.raw`%|퍼센트|원|달러|USD|\$|GWh|MWh|kWh|Wh\/kg|Wh|km|톤|대|건|명|개소|개|배|억달러|억원|억|만|천|조`;
const QUANT_RE = new RegExp(String.raw`\d[\d,.]*\s*(?:${QUANT_UNIT})|\$\s*\d[\d,.]*\s*[KMB]?|\d[\d,.]*\s*[KMB]\b`, 'g');

/** 텍스트에서 단위/규모 동반 정량 수치만 추출(시점/버전 제외, dedup). */
export function extractQuantitativeMetrics(text: string): string[] {
    let scrubbed = text;
    for (const re of NON_METRIC_PATTERNS) scrubbed = scrubbed.replace(re, ' ');
    const found = scrubbed.match(QUANT_RE) ?? [];
    return Array.from(new Set(found.map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean)));
}

/** 문자열이 정량 수치를 하나라도 담는지(헤드라인/metricsUsed 필터용). */
export function isQuantitativeMetric(s: string): boolean {
    return extractQuantitativeMetrics(s).length > 0;
}
