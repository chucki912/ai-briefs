/**
 * 시점 오염 운영 지표 (factAssertedAt / temporalRole 분포)
 *
 * 일일 추출에서 background/unknown/미표기-background 비율을 러닝 카운터로 누적한다.
 * 목적: 배포 후 주별 temporalRole 분포·unknown 비율을 기록해 오염 기준선
 * (ai 19.3% / battery 32.3%, battery 무표기 46%)과 비교하기 위함.
 *
 * ★ unknown 비율은 '기록' 지표이지 성공 기준이 아니다 — 낮은 unknown이 목표가 아니다.
 *   핵심 품질 지표는 factAssertedAt 정확도(원문 대조)이며 이 모듈이 측정하지 않는다.
 *
 * - 집계 키: `metrics:temporal`(도메인별 `metrics:temporal:battery`)
 * - 조회: kvGet 또는 getTemporalMetrics()
 * - 매 카드 생성 시 구조화 로그 라인(`[TEMPORAL-METRIC]`)도 출력(검증 grep용)
 */
import { kvGet, kvSet } from '../store';
import { factTemporalDistribution, c16_unknownNotNumericBasis } from './structured-checks';
import type { KeyFactStructured, KeyInsightStructured } from '@/types';

export const TEMPORAL_METRICS_KEY = 'metrics:temporal';
export const TEMPORAL_METRICS_TTL_SEC = 60 * 60 * 24 * 400;

export interface TemporalMetrics {
    cards: number;          // 집계된 카드 수
    facts: number;          // 집계된 fact 수
    current: number;
    background: number;
    unknown: number;        // factAssertedAt === 'unknown'
    datedYear: number;      // 'YYYY'
    datedMonth: number;     // 'YYYY-MM'
    backgroundMissingTimepoint: number; // C15 위반(배경인데 문장 내 시점 미표기)
    unknownNumericBasisCards: number;   // C16 위반 카드 수(unknown 정량에 근거한 insight)
    updatedAt: number;
}

function emptyMetrics(): TemporalMetrics {
    return {
        cards: 0, facts: 0, current: 0, background: 0, unknown: 0,
        datedYear: 0, datedMonth: 0, backgroundMissingTimepoint: 0,
        unknownNumericBasisCards: 0, updatedAt: 0,
    };
}

function metricsKey(domain?: 'ai' | 'battery'): string {
    return domain && domain !== 'ai' ? `${TEMPORAL_METRICS_KEY}:${domain}` : TEMPORAL_METRICS_KEY;
}

/**
 * 카드 1장의 시점 분포를 지표에 누적하고 구조화 로그를 남긴다.
 * 지표 적재 실패가 생성 파이프라인을 중단시키지 않도록 예외를 삼킨다.
 */
export async function recordTemporalMetrics(
    facts: KeyFactStructured[],
    insight: KeyInsightStructured | undefined,
    domain: 'ai' | 'battery' = 'ai',
    now: number = Date.now(),
): Promise<void> {
    const d = factTemporalDistribution(facts);
    const unknownNumericBasis = insight ? c16_unknownNotNumericBasis(insight, facts).length > 0 : false;

    // 구조화 로그(검증 grep용). 지표 KV 적재와 독립 — KV 실패해도 로그는 남는다.
    console.log(`[TEMPORAL-METRIC] domain=${domain} facts=${d.total} current=${d.current} background=${d.background} unknown=${d.unknown} datedYear=${d.datedYear} datedMonth=${d.datedMonth} bgMissingTimepoint=${d.backgroundMissingTimepoint} unknownNumericBasis=${unknownNumericBasis ? 1 : 0}`);

    try {
        const key = metricsKey(domain);
        const m = (await kvGet<TemporalMetrics>(key)) ?? emptyMetrics();
        m.cards += 1;
        m.facts += d.total;
        m.current += d.current;
        m.background += d.background;
        m.unknown += d.unknown;
        m.datedYear += d.datedYear;
        m.datedMonth += d.datedMonth;
        m.backgroundMissingTimepoint += d.backgroundMissingTimepoint;
        if (unknownNumericBasis) m.unknownNumericBasisCards += 1;
        m.updatedAt = now;
        await kvSet(key, m, TEMPORAL_METRICS_TTL_SEC);
    } catch (e) {
        console.error('[Temporal Metrics] 적재 실패(무시):', (e as Error).message);
    }
}

export async function getTemporalMetrics(domain?: 'ai' | 'battery'): Promise<TemporalMetrics | null> {
    return kvGet<TemporalMetrics>(metricsKey(domain));
}
