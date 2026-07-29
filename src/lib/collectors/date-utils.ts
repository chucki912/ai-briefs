/**
 * 수집 단계 발행일 파싱 + 수집 지표.
 *
 * 원칙: 실제 발행일을 파싱하고, 파싱 불가면 **추측하지 않고 null**로 둔다
 * (factAssertedAt의 unknown과 동일 원칙). null은 신선도(24h) 판정에서만 배제하고
 * 항목 자체는 유지한다 — 날짜 없는 매체를 통째로 탈락시켜 커버리지가 조용히 줄어드는 것을 막는다.
 */

/** 피드/검색 API의 다양한 날짜 표현을 Date로. 파싱 불가·부재 시 null. */
export function parseFeedDate(v: unknown): Date | null {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    const s = String(v).trim();
    if (!s) return null;
    // 절대 표현(ISO/RFC 2822): RSS pubDate, Brave page_age, Tavily published_date
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
    // 상대 표현: Brave 'age' 예) "2 days ago", "3 hours ago"
    const rel = s.match(/(\d+)\s*(minute|hour|day|week|month|year)s?\s*ago/i);
    if (rel) {
        const n = parseInt(rel[1], 10);
        const unitMs: Record<string, number> = {
            minute: 60_000, hour: 3_600_000, day: 86_400_000,
            week: 604_800_000, month: 2_592_000_000, year: 31_536_000_000,
        };
        const ms = unitMs[rel[2].toLowerCase()];
        if (ms) return new Date(Date.now() - n * ms);
    }
    return null;
}

/** 소스별 수집량/날짜미상률 지표. [COLLECT-METRIC] 로그로 남겨 재검증·AI 0카드 조사 입력값으로 쓴다. */
export function logCollectMetric(domain: 'ai' | 'battery', collector: string, items: { publishedAt: Date | null }[]): void {
    const total = items.length;
    const dated = items.filter(i => i.publishedAt).length;
    const nullRate = total ? Math.round((100 * (total - dated)) / total) : 0;
    console.log(`[COLLECT-METRIC] domain=${domain} collector=${collector} total=${total} dated=${dated} null=${total - dated} nullRate=${nullRate}%`);
}

/** 신선도 필터 결과 지표(수정 전후 수집량 비교용). */
export function logFilterMetric(domain: 'ai' | 'battery', inN: number, staleExcluded: number, nullKept: number, outN: number): void {
    console.log(`[COLLECT-METRIC] domain=${domain} stage=filter in=${inN} staleExcluded=${staleExcluded} nullKept=${nullKept} out=${outN}`);
}
