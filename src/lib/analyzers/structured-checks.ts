/**
 * 구조화 카드 컴퓨터블 체크 (LLM 없이 판정, 내용 미참조).
 * 전부 필드 관계·카디널리티·형식만 참조한다. 의미 판정은 여기 없다.
 *
 * 카드 단위: C1 C2 C4 C5 C9' C10 C11 C12 C13 C14
 * 배치 단위: C6
 */
import type {
    IssueItem,
    KeyFactStructured,
    KeyInsightStructured,
    SourceRef,
    SoWhatV2,
} from '@/types';

export interface CheckIssue {
    code: string;
    severity: 'error' | 'warning';
    message: string;
}

export interface CardCheckResult {
    ok: boolean;
    hasError: boolean;
    issues: CheckIssue[];
}

/** 소스 무결성 실패로 간주할 도메인(R4 나이브 해석 0%). config에서 주입 가능. */
export const BLOCKED_SOURCE_DOMAINS = ['news.google.com'];

/** 소스 정책(튜너블). MIN_SOURCED_FACTS 미만이면 카드 폐기(AN). MIN_DISTINCT_OUTLETS 미만이면 카드 폐기(C14).
 *  BC: MIN_SOURCED_FACTS 2→1 — fact 개수는 무결성 지표가 아니다(한계 fact를 끌어오는 슬롯 강요 재발).
 *  무결성 = C1(fact당 소스 ≥1) + C14(카드당 독립 outlet ≥2)가 인수. */
export const SOURCE_POLICY = { MIN_SOURCED_FACTS: 1, MIN_DISTINCT_OUTLETS: 2 };

/** C13(튜너블): 자기신고 high의 결박 자격 요건. */
export const C13_POLICY = { MIN_FACTS: 2, MIN_OUTLETS: 3 };

function host(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}

/** outlet 식별자(BD): host(url) 우선 정규화 — 같은 실매체가 수집 경로에 따라
 *  다른 라벨('TechCrunch AI' vs 'techcrunch.com')로 이중 계상되거나, 검색 수집기 라벨
 *  ('Tavily Search')로 뭉개지는 것을 체크 시점에 해소한다. url 파싱 불가 시에만 라벨 폴백. */
export function outletKey(s: SourceRef): string {
    return host(s.url) || (s.outlet || '').trim() || s.url;
}

export function distinctOutlets(sources: SourceRef[]): number {
    return new Set(sources.map(outletKey)).size;
}

/** BE: 자사 채널 도메인(보도자료·뉴스룸·IR). 사건의 1차 확인은 되지만 독립 검증이 아니므로
 *  C14의 독립 outlet 계산에서 미계상한다(소스 표기에서는 유지 — 삭제가 아니라 미계상).
 *  캐비앳: ^news\. 는 news.sky.com류 독립 매체도 걸 수 있다. 실측(2026-07-16) 부수 사망 0으로
 *  단순 패턴을 유지하되, 운영에서 오탐이 확인되면 데이터로 돌아와 화이트리스트를 논한다. */
export const PRESS_DOMAIN_PATTERNS: RegExp[] = [/^newsroom\./, /^press\./, /^news\./, /^investor(s)?\./];

export function isPressDomain(url: string): boolean {
    const h = host(url);
    return !!h && PRESS_DOMAIN_PATTERNS.some(re => re.test(h));
}

/** killTrigger 채점 설정(튜너블). */
export const KILL = { MIN_HORIZON_DAYS: 30 };

/** 날짜 없는 순수 임계(수치) 트리거 허용 패턴. */
const KILL_NUMERIC_THRESHOLD = /\d+\s?%|\$\s?\d|\d+\s?(억|조|배|GW|kWh|bp|건|개|명)|지수|점 이하|점 이상/;

/** killTrigger 텍스트에서 마감 시점(Date)을 파싱. 없으면 null. */
export function parseKillDeadline(text: string): Date | null {
    if (!text) return null;
    const years = [...text.matchAll(/\b(20\d{2})\b/g)].map(m => parseInt(m[1], 10));
    if (!years.length) return null;
    const y = Math.max(...years);
    const q = text.match(/([1-4])\s*분기|Q\s*([1-4])/);
    const mo = text.match(/(1[0-2]|0?[1-9])\s*월/);
    const day = text.match(/(3[01]|[12]\d|0?[1-9])\s*일/);
    if (mo && day) return new Date(y, parseInt(mo[1], 10) - 1, parseInt(day[1], 10));
    if (mo) return new Date(y, parseInt(mo[1], 10), 0); // 해당 월 말일
    if (q) { const qq = parseInt(q[1] || q[2], 10); return new Date(y, qq * 3, 0); } // 분기 말일
    return new Date(y, 11, 31); // 연말
}

// ── 카드 단위 체크 ───────────────────────────────────────────────────────────

/** C1: 모든 keyFact가 sourceId ≥1. */
export function c1_allFactsSourced(facts: KeyFactStructured[]): CheckIssue[] {
    const bad = facts.filter(f => !f.sourceIds || f.sourceIds.length < 1);
    return bad.length
        ? [{ code: 'c1_unsourced_fact', severity: 'error', message: `무출처 fact ${bad.length}건 (sourceIds 빈 배열)` }]
        : [];
}

/** C2: 모든 sourceRef가 resolvedUrl 보유 + BLOCKED 도메인 아님. */
export function c2_allSourcesResolved(sources: SourceRef[]): CheckIssue[] {
    const bad = sources.filter(s => {
        if (s.resolved === false) return true;
        const h = host(s.url);
        return !h || BLOCKED_SOURCE_DOMAINS.some(d => h.includes(d));
    });
    return bad.length
        ? [{ code: 'c2_unresolved_source', severity: 'error', message: `미해석/차단 도메인 소스 ${bad.length}건` }]
        : [];
}

/** C4: keyInsight.restsOnFactIds ⊆ keyFacts.id (선언 무결성). */
export function c4_restsOnValid(insight: KeyInsightStructured, facts: KeyFactStructured[]): CheckIssue[] {
    const ids = new Set(facts.map(f => f.id));
    const dangling = (insight.restsOnFactIds || []).filter(id => !ids.has(id));
    if (dangling.length) return [{ code: 'c4_dangling_restson', severity: 'error', message: `restsOnFactIds에 없는 fact id: ${dangling.join(',')}` }];
    if (!insight.restsOnFactIds || insight.restsOnFactIds.length < 1) return [{ code: 'c4_empty_restson', severity: 'error', message: 'keyInsight가 어떤 fact에도 근거하지 않음(restsOnFactIds 빔)' }];
    return [];
}

/** C5': killTrigger가 미래에 채점 가능해야 함. 만료된 날짜/파싱불가 = 하드 실패. */
export function c5prime_killTriggerFuture(sw: SoWhatV2, now: Date = new Date()): CheckIssue[] {
    const text = sw.killTrigger || '';
    const deadline = parseKillDeadline(text);
    const cutoff = new Date(now.getTime() + KILL.MIN_HORIZON_DAYS * 86400000);
    if (deadline) {
        if (deadline.getTime() < cutoff.getTime()) {
            return [{ code: 'c5_expired_killtrigger', severity: 'error', message: `killTrigger 만료/임박: ${deadline.toISOString().slice(0, 10)} < 오늘+${KILL.MIN_HORIZON_DAYS}일` }];
        }
        return [];
    }
    // 날짜 없음 → 순수 수치 임계면 허용(미래 채점 가능), 아니면 실패
    if (KILL_NUMERIC_THRESHOLD.test(text)) return [];
    return [{ code: 'c5_undatable_killtrigger', severity: 'error', message: 'killTrigger에 미래 날짜도 수치 임계도 없음(채점 불가)' }];
}

/** C9': actionType='act' → confidence='high'. (자기신고 confidence를 act의 열쇠로 두되 C13이 별도 결박) */
export function c9prime_actRequiresHigh(sw: SoWhatV2, insight: KeyInsightStructured): CheckIssue[] {
    if (sw.actionType === 'act' && insight.confidence !== 'high') {
        return [{ code: 'c9_act_low_confidence', severity: 'error', message: `actionType=act인데 confidence=${insight.confidence} (act은 high 요구)` }];
    }
    return [];
}

/** C10: actionType='act' → action 전 필드 존재. */
export function c10_actComplete(sw: SoWhatV2): CheckIssue[] {
    if (sw.actionType !== 'act') return [];
    const a = sw.action;
    if (!a || !a.what || typeof a.reversible !== 'boolean' || !a.costIfWrong || !a.costIfMissed) {
        return [{ code: 'c10_incomplete_action', severity: 'error', message: 'actionType=act인데 action 필드 불완전(what/reversible/costIfWrong/costIfMissed)' }];
    }
    return [];
}

/** C11: actionType='observe' → observe.metric 비어있지 않음. */
export function c11_observeHasMetric(sw: SoWhatV2): CheckIssue[] {
    if (sw.actionType !== 'observe') return [];
    if (!sw.observe || !sw.observe.metric || !sw.observe.metric.trim()) {
        return [{ code: 'c11_empty_metric', severity: 'error', message: 'actionType=observe인데 observe.metric 비어있음' }];
    }
    return [];
}

/** C14: 카드가 결박한 소스의 독립 outlet 하한(무조건부). 단일 매체에만 근거한 카드 차단(원본 카드3).
 *  BE: 자사 채널(PRESS_DOMAIN_PATTERNS)은 독립 outlet으로 세지 않는다. */
export function c14_minDistinctOutlets(sources: SourceRef[], min = SOURCE_POLICY.MIN_DISTINCT_OUTLETS): CheckIssue[] {
    const independent = sources.filter(s => !isPressDomain(s.url));
    const n = distinctOutlets(independent);
    return n < min
        ? [{ code: 'c14_single_outlet', severity: 'error', message: `독립 outlet ${n} < ${min} (자사 채널 ${sources.length - independent.length}건 미계상)` }]
        : [];
}

/** C13: confidence='high'는 결박으로 자격을 증명해야 함 — restsOn fact 수 + 그 fact들이 결박한 outlet 다양성. */
export function c13_highRequiresBinding(
    insight: KeyInsightStructured,
    facts: KeyFactStructured[],
    sources: SourceRef[],
    policy = C13_POLICY,
): CheckIssue[] {
    if (insight.confidence !== 'high') return [];
    const factById = new Map(facts.map(f => [f.id, f]));
    const refById = new Map(sources.map(s => [s.id, s]));
    const restsOn = insight.restsOnFactIds || [];
    const sids = restsOn.flatMap(id => factById.get(id)?.sourceIds || []);
    const outlets = new Set(sids.map(id => { const r = refById.get(id); return r ? outletKey(r) : id; })).size;
    if (restsOn.length < policy.MIN_FACTS || outlets < policy.MIN_OUTLETS) {
        return [{ code: 'c13_unbacked_high', severity: 'error', message: `confidence=high인데 restsOn fact ${restsOn.length}/${policy.MIN_FACTS}, outlets ${outlets}/${policy.MIN_OUTLETS} — 결박 미달` }];
    }
    return [];
}

/** C12: actionType='none' → action·observe 부재. */
export function c12_noneIsEmpty(sw: SoWhatV2): CheckIssue[] {
    if (sw.actionType !== 'none') return [];
    if (sw.action || sw.observe) {
        return [{ code: 'c12_none_has_block', severity: 'error', message: 'actionType=none인데 action/observe가 존재' }];
    }
    return [];
}

/** 카드 전체 구조 체크 실행. now: killTrigger 만료 판정 기준(주입 가능, 테스트/결정성). */
export function checkCard(issue: IssueItem, now: Date = new Date()): CardCheckResult {
    const issues: CheckIssue[] = [];
    const facts = issue.structuredFacts;
    const sources = issue.sourceRefs;
    const insight = issue.keyInsight;
    const sw = issue.soWhatV2;

    if (!facts || !sources || !insight || !sw) {
        return { ok: false, hasError: true, issues: [{ code: 'missing_structure', severity: 'error', message: '구조화 필드 누락(structuredFacts/sourceRefs/keyInsight/soWhatV2)' }] };
    }

    issues.push(...c1_allFactsSourced(facts));
    issues.push(...c2_allSourcesResolved(sources));
    issues.push(...c4_restsOnValid(insight, facts));
    issues.push(...c13_highRequiresBinding(insight, facts, sources));
    issues.push(...c14_minDistinctOutlets(sources));
    issues.push(...c5prime_killTriggerFuture(sw, now));
    issues.push(...c9prime_actRequiresHigh(sw, insight));
    issues.push(...c10_actComplete(sw));
    issues.push(...c11_observeHasMetric(sw));
    issues.push(...c12_noneIsEmpty(sw));

    const hasError = issues.some(i => i.severity === 'error');
    return { ok: issues.length === 0, hasError, issues };
}

// ── 배치 단위 체크 ───────────────────────────────────────────────────────────

/** 튜너블(하드코딩 금지). */
export const BATCH_CONFIG = {
    DUP_THRESHOLD: 0.5, // 소스 교집합 비율(C6)
};

/** C6: 배치 내 카드쌍 sourceId(=url) 교집합 > DUP_THRESHOLD → 병합 후보. */
export function c6_batchDupPairs(cards: IssueItem[], threshold = BATCH_CONFIG.DUP_THRESHOLD): Array<{ a: number; b: number; overlap: number }> {
    const urlsets = cards.map(c => new Set((c.sources || []).map(u => u)));
    const pairs: Array<{ a: number; b: number; overlap: number }> = [];
    for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
            const A = urlsets[i], B = urlsets[j];
            if (A.size === 0 || B.size === 0) continue;
            const inter = [...A].filter(x => B.has(x)).length;
            const overlap = inter / Math.min(A.size, B.size);
            if (overlap > threshold) pairs.push({ a: i, b: j, overlap });
        }
    }
    return pairs;
}
