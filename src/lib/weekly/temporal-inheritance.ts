/**
 * B-4 / rule 3 — 일일 시점 메타의 주간 상속 규칙 (결정론 순수함수).
 *
 * 원칙: 주간은 일일의 factAssertedAt/temporalRole을 **그대로 상속**한다(재추출·재판정 금지).
 * 일일에서 차단한 시점 오염이 주간 지표(observedDates/M2/[배경])로 재유입되지 않게 한다.
 *
 * 규칙:
 *  · observedDates 계상은 temporalRole=='current' 인 사실이 있는 날짜만(background 전용 날짜 제외)
 *  · M2(가속) 비교: 양쪽 시점이 모두 12개월 초과면 불인정. 한쪽 과거·한쪽 최근은 유효
 *  · 시점 앵커 신뢰도: quote > sourcePublishedAt > (legacy/web/none = 불신뢰)
 *    - sourcePublishedAt은 temporalRole 오분류 시 오래된 사실에 기사일이 찍힐 수 있어
 *      M2·정량 앵커로는 쓰지 않는다(C-7 갭과 동일 처리).
 *  · legacy 관측(anchorSource 필드 부재 = 구코드 산출물)은 A 산정에서 배제, B/C 근거로는 유효
 */
import type { NormalizedItem, NormalizedFact } from './types';

/** 이 fact가 '이번 전개(current)'인가. temporalRole 부재(구코드)는 판별 불가 → current로 취급.
 *  근거: 구코드 데이터를 전부 배제하면 legacy 스레드의 observedDates가 0이 되어 전량 강등된다.
 *  대신 legacy는 A 등급 산정에서 별도로 배제되므로 거짓 A는 발생하지 않는다. */
export function isCurrentFact(f: NormalizedFact): boolean {
    return f.temporalRole !== 'background';
}

/** 시점 앵커를 정량 비교(M2)에 쓸 수 있는가 = 원문 인용으로 결속된 경우만.
 *  sourcePublishedAt(발행일 앵커)·none·필드부재는 불인정. */
export function isQuoteAnchored(f: NormalizedFact): boolean {
    return f.factAssertedAt?.anchorSource === 'quote' && f.factAssertedAt.value !== 'unknown';
}

/** observedDates 계상(rule 3): current 사실을 가진 날짜만. 오름차순 distinct. */
export function currentObservedDates(items: NormalizedItem[]): string[] {
    const dates = new Set<string>();
    for (const it of items) {
        // facts 미탑재(방어) 시엔 날짜를 인정 — 배관 이전 데이터로 전량 강등되는 것을 막는다.
        if (!it.facts || it.facts.length === 0) { dates.add(it.publishedAt); continue; }
        if (it.facts.some(isCurrentFact)) dates.add(it.publishedAt);
    }
    return Array.from(dates).sort();
}

/** 'YYYY' | 'YYYY-MM' → 기준일로부터 경과 개월. 파싱 불가/unknown이면 null. */
export function monthsAgo(value: string | undefined, asOf: string | Date): number | null {
    if (!value || value === 'unknown') return null;
    const m = /^(\d{4})(?:-(\d{2}))?$/.exec(value.trim());
    if (!m) return null;
    const y = Number(m[1]), mo = m[2] ? Number(m[2]) : 12; // 연도만이면 연말로 보수적 처리
    const ref = asOf instanceof Date ? asOf : new Date(`${String(asOf).slice(0, 10)}T00:00:00`);
    return (ref.getFullYear() - y) * 12 + (ref.getMonth() + 1 - mo);
}

export const M2_MAX_AGE_MONTHS = 12;

/**
 * M2(가속) 후보 판정 — rule 3 적용판.
 * 조건: quote 앵커된 정량 시점이 서로 다른 2개 이상 존재 AND 양쪽 모두 12개월 초과가 아님
 * (한쪽 과거·한쪽 최근은 유효 — '가속'은 과거 대비 최근 변화이므로 정당).
 */
export function m2CandidateWithTemporal(items: NormalizedItem[], asOf: string | Date): boolean {
    const ages = new Set<number>();
    for (const it of items) {
        for (const f of it.facts ?? []) {
            if (!isQuoteAnchored(f)) continue;         // 발행일 앵커·legacy·unknown 배제
            const a = monthsAgo(f.factAssertedAt?.value, asOf);
            if (a === null) continue;
            ages.add(a);
        }
    }
    if (ages.size < 2) return false;
    const sorted = [...ages].sort((x, y) => x - y);
    // 가장 최근 시점이 12개월 이내여야 함(= 양쪽 모두 12개월 초과면 불인정)
    return sorted[0] <= M2_MAX_AGE_MONTHS;
}

/** [배경] 슬롯용: 시점이 확인된(quote 앵커) background 사실. 시점 표기와 함께 인용할 수 있다. */
export function datedBackgroundFacts(items: NormalizedItem[]): NormalizedFact[] {
    return (items ?? []).flatMap(it => (it.facts ?? []).filter(f => f.temporalRole === 'background' && isQuoteAnchored(f)));
}

/** 정량 근거로 쓸 수 있는 사실(수치 앵커): quote 앵커 + current. unknown·발행일앵커는 서술만 허용. */
export function quantitativeAnchorFacts(items: NormalizedItem[]): NormalizedFact[] {
    return (items ?? []).flatMap(it => (it.facts ?? []).filter(f => isQuoteAnchored(f) && isCurrentFact(f)));
}
