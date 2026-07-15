/**
 * Key Insight 게이트 운영 지표 집계 (영속화)
 *
 * 프로덕션에서 생성될 때마다 검증/재생성 결과를 KV(로컬파일·Vercel KV·Redis 공용 추상화)에
 * 러닝 카운터로 누적한다. "데이터 축적 후 판단"을 계획이 아니라 자동 집계 + 임계값 판정으로 만든다.
 *
 * - 집계 장소: KV 키 `metrics:key-insight`(도메인별 `metrics:key-insight:battery`)
 * - 판단 기준: evaluateKeyInsightThresholds() 가 임계값 대비 자동 권고를 반환
 * - 조회: `npx tsx scripts/key-insight-metrics.ts`
 */
import { kvGet, kvSet } from '../store';
import type { ValidatedKeyInsightResult, KeyInsightIssueCode } from './key-insight';

export const KEY_INSIGHT_METRICS_KEY = 'metrics:key-insight';
/** 롤링 TTL(약 400일). 매 기록 시 갱신되어 사실상 만료되지 않음.
 *  로컬 파일 어댑터가 무기한(Infinity) 만료를 JSON 직렬화하며 null로 잃는 문제를 회피하기 위해
 *  유한 TTL을 명시한다(Redis에서도 롤링 EX로 안전). */
export const KEY_INSIGHT_METRICS_TTL_SEC = 60 * 60 * 24 * 400;

export interface KeyInsightMetrics {
    total: number; //             집계된 생성 건수
    firstPassClean: number; //    1차에서 error 없이 통과(재생성 불필요)
    regenerated: number; //       재생성 시도 건수
    resolved: number; //          재생성으로 error 해소(chosen=regenerated & 최종 clean)
    unresolved: number; //        재생성 후에도 최종 error 잔존(또는 재생성 실패)
    regenError: number; //        재생성기 호출 자체 실패
    chosenRegen: number; //       재생성 결과 채택 건수
    /** 1차 위반 코드별 발생 빈도(재생성 유발 원인 분포) */
    codeCounts: Partial<Record<KeyInsightIssueCode, number>>;
    updatedAt: number;
}

function emptyMetrics(): KeyInsightMetrics {
    return {
        total: 0,
        firstPassClean: 0,
        regenerated: 0,
        resolved: 0,
        unresolved: 0,
        regenError: 0,
        chosenRegen: 0,
        codeCounts: {},
        updatedAt: 0,
    };
}

function metricsKey(domain?: 'ai' | 'battery'): string {
    return domain && domain !== 'ai' ? `${KEY_INSIGHT_METRICS_KEY}:${domain}` : KEY_INSIGHT_METRICS_KEY;
}

/**
 * 검증/재생성 결과 1건을 지표에 누적한다.
 * 지표 적재 실패가 본 생성 파이프라인을 절대 중단시키지 않도록 예외를 삼킨다.
 * @param now 호출 시각(ms). 스크립트/서버에서 주입(모듈이 Date에 직접 의존하지 않도록).
 */
export async function recordKeyInsightMetrics(
    result: ValidatedKeyInsightResult,
    domain: 'ai' | 'battery' = 'ai',
    now: number = Date.now(),
): Promise<void> {
    try {
        const key = metricsKey(domain);
        const m = (await kvGet<KeyInsightMetrics>(key)) ?? emptyMetrics();

        m.total += 1;
        if (!result.firstValidation.hasError) {
            m.firstPassClean += 1;
        }
        if (result.regenerated) {
            m.regenerated += 1;
            if (result.regenError) m.regenError += 1;
            if (result.chosen === 'regenerated') m.chosenRegen += 1;
            if (result.finalValidation.hasError) m.unresolved += 1;
            else if (result.chosen === 'regenerated') m.resolved += 1;
        }
        // 1차 위반 코드 분포(원인 진단용)
        for (const issue of result.firstValidation.issues) {
            if (issue.severity !== 'error') continue;
            m.codeCounts[issue.code] = (m.codeCounts[issue.code] ?? 0) + 1;
        }
        m.updatedAt = now;

        await kvSet(key, m, KEY_INSIGHT_METRICS_TTL_SEC);
    } catch (e) {
        console.error('[Key Insight Metrics] 적재 실패(무시):', (e as Error).message);
    }
}

export async function getKeyInsightMetrics(domain?: 'ai' | 'battery'): Promise<KeyInsightMetrics | null> {
    return kvGet<KeyInsightMetrics>(metricsKey(domain));
}

// ── 판단 기준선(임계값) ──────────────────────────────────────────────────────

/** 결정 최소 표본. 이 미만이면 통계적 판단을 보류한다. */
export const DECISION_MIN_SAMPLE = 200;

export interface ThresholdVerdict {
    ready: boolean; //            표본 충분 여부
    recommendations: string[]; // 임계값 대비 자동 권고
    stats: {
        sample: number;
        regenRate: number; //     재생성률
        unresolvedRate: number; // 미해소율(전체 대비)
        resolveRate: number; //   재생성 중 해소 비율
        topCode?: { code: string; share: number };
    };
}

/**
 * 누적 지표를 임계값과 비교해 다음 행동을 자동 권고한다.
 * falseNegativeRate: 별도 평가 스크립트가 산출한 게이트 누락률(0~1). 없으면 판단에서 제외.
 */
export function evaluateKeyInsightThresholds(
    m: KeyInsightMetrics,
    falseNegativeRate?: number,
): ThresholdVerdict {
    const sample = m.total;
    const regenRate = sample ? m.regenerated / sample : 0;
    const unresolvedRate = sample ? m.unresolved / sample : 0;
    const resolveRate = m.regenerated ? m.resolved / m.regenerated : 0;

    const codeEntries = Object.entries(m.codeCounts) as [string, number][];
    const totalCodes = codeEntries.reduce((a, [, n]) => a + n, 0);
    const top = codeEntries.sort((a, b) => b[1] - a[1])[0];
    const topCode = top && totalCodes ? { code: top[0], share: top[1] / totalCodes } : undefined;

    const recommendations: string[] = [];
    const ready = sample >= DECISION_MIN_SAMPLE;

    if (!ready) {
        recommendations.push(`표본 ${sample}/${DECISION_MIN_SAMPLE} — 통계적 판단 보류(계속 누적).`);
    } else {
        // 기준선: 미해소율 > 5% → 규칙 강화 또는 LLM 2차 검증 도입 검토
        if (unresolvedRate > 0.05) {
            recommendations.push(`미해소율 ${(unresolvedRate * 100).toFixed(1)}% > 5% — 재생성 프롬프트 강화 또는 LLM 2차 검증 도입 검토.`);
        }
        // 기준선: 재생성률 > 15% → 기본 생성 프롬프트 자체 품질 저하(비용 유발)
        if (regenRate > 0.15) {
            recommendations.push(`재생성률 ${(regenRate * 100).toFixed(1)}% > 15% — 기본 프롬프트 준수도 저하, 가이드 개정 필요(비용 영향).`);
        }
        // 기준선: 재생성률 < 1% & 게이트 누락률 > 10% → 게이트가 헐거워 나쁜 결과를 통과시킴
        if (regenRate < 0.01 && falseNegativeRate !== undefined && falseNegativeRate > 0.1) {
            recommendations.push(`재생성률 ${(regenRate * 100).toFixed(1)}%로 낮은데 게이트 누락률 ${(falseNegativeRate * 100).toFixed(0)}% > 10% — 규칙이 헐거움, LLM 게이트 도입 권고.`);
        }
        // 기준선: 특정 코드가 1차 위반의 40% 초과 → 해당 패턴/프롬프트 표적 개선
        if (topCode && topCode.share > 0.4) {
            recommendations.push(`위반의 ${(topCode.share * 100).toFixed(0)}%가 '${topCode.code}' — 해당 패턴/프롬프트 표적 튜닝.`);
        }
        if (recommendations.length === 0) {
            recommendations.push('모든 지표가 임계값 이내 — 현행 유지.');
        }
    }

    return { ready, recommendations, stats: { sample, regenRate, unresolvedRate, resolveRate, topCode } };
}
