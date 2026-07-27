/**
 * PASS 7 — 주간 스레드 DoD 검증 (결정론적, 순수 함수) (T6)
 *
 * 스펙 DoD + T5 지침(시사점 8-word-gram 중복 0·금지어미 0·C등급 단정 0)을 코드로 강제한다.
 * 위반 시 report-gen이 재생성 1회 → 재실패 시 강등. detail은 재생성 프롬프트 피드백으로 재사용.
 *
 * 일부(단락 기능 배합·관측주체·C 단정)는 휴리스틱이며 hard/soft로 구분한다.
 */
import {
    LENGTH, STRUCTURE, PARAGRAPH_MIX, IMPLICATION_FORBIDDEN_ENDINGS, OVERCLAIM_FORBIDDEN,
    extractQuantitativeMetrics, isQuantitativeMetric,
} from '@/configs/weekly-house-style';
import type { WeeklyThreadContent } from './report-gen';

export interface WeeklyGateFailure {
    rule: string;
    detail: string;
    severity: 'hard' | 'soft';
}

/** 공백 제외 문자 수(한글 글자수 근사). */
export function charLen(s: string): number {
    return [...s.replace(/\s/g, '')].length;
}

/** 공백 분리 토큰의 n-gram 집합. */
function wordNgrams(text: string, n: number): Set<string> {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const out = new Set<string>();
    for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(' '));
    return out;
}

/** 시사점이 본문을 8-word-gram 단위로 그대로 베꼈는지(재요약 금지). */
export function eightGramOverlap(implication: string, body: string): number {
    const bodyGrams = wordNgrams(body, 8);
    if (bodyGrams.size === 0) return 0;
    let overlap = 0;
    for (const g of wordNgrams(implication, 8)) if (bodyGrams.has(g)) overlap++;
    return overlap;
}

/** 마크다운 헤더 수/최대 깊이. */
export function headerStats(md: string): { count: number; maxDepth: number } {
    let count = 0, maxDepth = 0;
    for (const line of md.split('\n')) {
        const m = /^(#{1,6})\s+\S/.exec(line.trim());
        if (m) { count++; maxDepth = Math.max(maxDepth, m[1].length); }
    }
    return { count, maxDepth };
}

const DATE_RE = /\d{4}-W\d{2}|\d{4}-\d{2}|\d{4}\s*년|\d{1,2}\s*월|\d{1,2}\s*일|분기|반기|말까지|까지/;
const OBSERVER_HINTS = ['관측', '발표', '공시', '보도', '고객사', '당국', '규제', '지수', '보고서', '어닝', '실적', 'TF', '팀', '기관', 'SEC', 'DOE', '공식', '집계'];
const ASSERTION_MARKERS = ['분명하다', '확실하다', '틀림없', '명백하다', '반드시', '확정적'];

/** 단락 기능 분류(휴리스틱). 단순서술(B9) 상한 판정이 핵심. */
export function classifyParagraphs(body: string): { total: number; b9plain: number; b7outlook: number } {
    const paras = body.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0 && !/^#{1,6}\s/.test(p) && !p.startsWith('|'));
    let b9 = 0, b7 = 0;
    for (const p of paras) {
        const hasNumber = /\d/.test(p);
        const isComparison = /대비|전주|전월|전년|반면|비교|보다|vs\.?|증가|감소|상승|하락/.test(p);
        const isOutlook = /전망|예상|향후|계획|것으로|할 것|전개|추진|~까지|목표|로드맵|예정/.test(p);
        const isInterpret = /의미|시사|해석|결과적|따라서|즉,|본질적|구조적|핵심은/.test(p);
        if (isOutlook) b7++;
        // 단순서술: 수치·비교·해석·전망 어느 것도 아닌 사건 나열
        if (!hasNumber && !isComparison && !isInterpret && !isOutlook) b9++;
    }
    return { total: paras.length, b9plain: b9, b7outlook: b7 };
}

/** 스레드 본문 DoD 검증. hard 위반이 하나라도 있으면 재생성 대상. */
export function validateWeeklyThread(c: WeeklyThreadContent): WeeklyGateFailure[] {
    const fails: WeeklyGateFailure[] = [];
    const body = `${c.background}\n\n${c.mainContent}`;
    const bodyLen = charLen(body);
    const implLen = charLen(c.implications);

    // 6: 본문 1100~1500자
    if (bodyLen < LENGTH.BODY_MIN || bodyLen > LENGTH.BODY_MAX) {
        fails.push({ rule: 'body_length', severity: 'hard', detail: `본문 ${bodyLen}자 (허용 ${LENGTH.BODY_MIN}~${LENGTH.BODY_MAX}). ${bodyLen > LENGTH.BODY_MAX ? '축약' : '보강'} 필요.` });
    }
    // 5: 시사점 300~450자 + 비율 0.20~0.25
    if (implLen < LENGTH.IMPLICATION_MIN || implLen > LENGTH.IMPLICATION_MAX) {
        fails.push({ rule: 'implication_length', severity: 'hard', detail: `시사점 ${implLen}자 (허용 ${LENGTH.IMPLICATION_MIN}~${LENGTH.IMPLICATION_MAX}).` });
    }
    const ratio = bodyLen > 0 ? implLen / bodyLen : 0;
    if (ratio < LENGTH.IMPLICATION_RATIO_MIN || ratio > LENGTH.IMPLICATION_RATIO_MAX) {
        fails.push({ rule: 'implication_ratio', severity: 'hard', detail: `시사점/본문 비율 ${(ratio * 100).toFixed(1)}% (허용 ${LENGTH.IMPLICATION_RATIO_MIN * 100}~${LENGTH.IMPLICATION_RATIO_MAX * 100}%).` });
    }
    // 5: 시사점 명시율 100% (비어있지 않음)
    if (implLen === 0) fails.push({ rule: 'implication_present', severity: 'hard', detail: '시사점이 비어 있음.' });

    // 7: distinct 정량 수치 >=3 (단위/규모 동반만 — 시점/연도/버전 제외, 헤드라인과 동일 정의)
    const distinctNums = new Set([
        ...(c.metricsUsed ?? []).filter(isQuantitativeMetric),
        ...extractQuantitativeMetrics(body),
    ]);
    if (distinctNums.size < STRUCTURE.MIN_DISTINCT_METRICS) {
        fails.push({ rule: 'distinct_metrics', severity: 'hard', detail: `정량 수치(단위/규모 동반) ${distinctNums.size}개 (>= ${STRUCTURE.MIN_DISTINCT_METRICS} 필요). 시점/연도는 불인정.` });
    }
    // 7: 비교 구조 표 >=1 (헤더>=2, 행>=2)
    if (!c.table || c.table.headers.length < 2 || c.table.rows.length < 2) {
        fails.push({ rule: 'comparison_table', severity: 'hard', detail: `비교 구조 표 부족(헤더 ${c.table?.headers.length ?? 0}, 행 ${c.table?.rows.length ?? 0}). 시점/대상 비교 표 1개 이상.` });
    }
    // 6: 헤더 3~4, 최대 깊이 <=2
    const h = headerStats(body);
    if (h.count < STRUCTURE.HEADER_MIN || h.count > STRUCTURE.HEADER_MAX) {
        fails.push({ rule: 'header_count', severity: 'soft', detail: `헤더 ${h.count}개 (${STRUCTURE.HEADER_MIN}~${STRUCTURE.HEADER_MAX}).` });
    }
    if (h.maxDepth > STRUCTURE.MAX_DEPTH) {
        fails.push({ rule: 'header_depth', severity: 'soft', detail: `헤더 최대 깊이 ${h.maxDepth} (<= ${STRUCTURE.MAX_DEPTH}).` });
    }
    // 9: observedDates==1 → 과대주장 금지어 0
    if (c.observedDates.length === 1) {
        const hit = OVERCLAIM_FORBIDDEN.filter(w => body.includes(w));
        if (hit.length > 0) fails.push({ rule: 'overclaim_forbidden', severity: 'hard', detail: `단일일 관측인데 과대주장어 사용: ${hit.join(', ')}` });
    }
    // 10: 킬 트리거 날짜 + 관측 주체
    if (!c.killTrigger || !DATE_RE.test(c.killTrigger)) {
        fails.push({ rule: 'kill_trigger_date', severity: 'hard', detail: '킬 트리거에 날짜/시점이 없음.' });
    }
    if (!c.killTrigger || !OBSERVER_HINTS.some(w => c.killTrigger.includes(w))) {
        fails.push({ rule: 'kill_trigger_observer', severity: 'soft', detail: '킬 트리거에 관측 주체/확인 경로가 불명확.' });
    }
    // T5 지침: 시사점 금지 어미 0
    const endHit = IMPLICATION_FORBIDDEN_ENDINGS.filter(e => new RegExp(`${e}[.\\s]*$`).test(c.implications.trim()) || c.implications.trim().endsWith(e));
    if (endHit.length > 0) fails.push({ rule: 'implication_forbidden_ending', severity: 'hard', detail: `시사점 금지 어미: ${endHit.join(', ')}` });
    // T5 지침: 시사점 8-word-gram 본문 중복 0
    const overlap = eightGramOverlap(c.implications, body);
    if (overlap > 0) fails.push({ rule: 'implication_body_overlap', severity: 'hard', detail: `시사점이 본문을 8-word-gram ${overlap}건 그대로 인용(재요약 금지).` });
    // T5 지침: 등급 C 단정 표현 0
    if (c.grade === 'C') {
        const aHit = ASSERTION_MARKERS.filter(w => c.implications.includes(w));
        if (aHit.length > 0) fails.push({ rule: 'c_grade_assertion', severity: 'hard', detail: `C등급 시사점 단정 표현: ${aHit.join(', ')}` });
    }
    // 8: 단순서술 <=20%, 전망계획 25~40%
    const mix = classifyParagraphs(body);
    if (mix.total >= 5) {
        const b9r = mix.b9plain / mix.total;
        const b7r = mix.b7outlook / mix.total;
        if (b9r > PARAGRAPH_MIX.B9_PLAIN_MAX) fails.push({ rule: 'paragraph_plain', severity: 'hard', detail: `단순서술 단락 ${(b9r * 100).toFixed(0)}% (<= ${PARAGRAPH_MIX.B9_PLAIN_MAX * 100}%). 비교·해석으로 재작성.` });
        if (b7r < PARAGRAPH_MIX.B7_OUTLOOK_MIN || b7r > PARAGRAPH_MIX.B7_OUTLOOK_MAX) fails.push({ rule: 'paragraph_outlook', severity: 'soft', detail: `전망·계획 단락 ${(b7r * 100).toFixed(0)}% (${PARAGRAPH_MIX.B7_OUTLOOK_MIN * 100}~${PARAGRAPH_MIX.B7_OUTLOOK_MAX * 100}%).` });
    }

    return fails;
}

/** hard 위반만 재생성 트리거. */
export function hasHardFailure(fails: WeeklyGateFailure[]): boolean {
    return fails.some(f => f.severity === 'hard');
}

/** 재생성 프롬프트 피드백 문자열. */
export function buildRegenFeedback(fails: WeeklyGateFailure[]): string {
    return fails.map(f => `- [${f.rule}] ${f.detail}`).join('\n');
}
