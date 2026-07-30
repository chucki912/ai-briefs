/**
 * So What 슬롯 채움률 지표.
 *
 * 원칙: 빈 값은 위반이 아니다(근거 없으면 비운다 — 억지 채움 금지). 대신 **비율을 관측**해
 * "슬롯 정의 문제"인지 "정말 특정 불가한 카드가 많은지"를 데이터로 판단한다.
 * costIfWrong은 이전에 action 객체 안에만 있어 actionType='act'(실측 0건)에서만 도달 가능했고
 * 100% 미출력이었다 — 상위 필드로 승격 후 이 지표로 실제 채움률을 추적한다.
 *
 * 구조화 로그 `[SOWHAT-METRIC]` 1줄 + KV 러닝 카운터(선택).
 */
import type { SoWhatV2 } from '@/types';

export interface SoWhatSlotCounts {
    cards: number;
    actionType: Record<string, number>;
    costIfWrongFilled: number;
    costIfWrongEmpty: number;
    betFilled: number;
    betEmpty: number;
    betEqualsMetric: number;   // 위반(판단 슬롯에 관측 지표 복사) — 0이어야 한다
}

const empty = (s?: string) => !s || !s.trim();

/** 카드 1장의 So What 슬롯 상태를 구조화 로그로 남긴다(파이프라인 비중단, 예외 없음). */
export function recordSoWhatMetrics(
    v2: SoWhatV2,
    legacy: { bet: string; downside: string },
    domain: 'ai' | 'battery' = 'ai',
    /** costIfWrong 규모의 근거 유무(c21). 미지정이면 'n/a'로 기록. */
    magnitude: 'grounded' | 'ungrounded' | 'qualitative' | 'n/a' = 'n/a',
): void {
    const costFilled = !empty(v2.costIfWrong) || !empty(v2.action?.costIfWrong);
    const betFilled = !empty(legacy.bet);
    const betEqMetric = !empty(legacy.bet) && !empty(v2.observe?.metric)
        && legacy.bet.trim() === (v2.observe?.metric ?? '').trim();
    console.log(`[SOWHAT-METRIC] domain=${domain} actionType=${v2.actionType} costIfWrong=${costFilled ? 'filled' : 'empty'} downside=${empty(legacy.downside) ? 'empty' : 'filled'} bet=${betFilled ? 'filled' : 'empty'} betEqualsMetric=${betEqMetric ? 1 : 0} costMagnitude=${magnitude}`);
}

/** 여러 카드의 슬롯 분포 집계(검증 스크립트·리포트용 순수 함수). */
export function aggregateSoWhatSlots(
    cards: Array<{ soWhatV2?: SoWhatV2; soWhat?: { bet: string; downside: string } }>,
): SoWhatSlotCounts {
    const out: SoWhatSlotCounts = {
        cards: 0, actionType: {}, costIfWrongFilled: 0, costIfWrongEmpty: 0,
        betFilled: 0, betEmpty: 0, betEqualsMetric: 0,
    };
    for (const c of cards) {
        out.cards += 1;
        const v2 = c.soWhatV2;
        const at = v2?.actionType ?? 'none';
        out.actionType[at] = (out.actionType[at] ?? 0) + 1;
        const cost = v2?.costIfWrong ?? v2?.action?.costIfWrong ?? c.soWhat?.downside;
        if (empty(cost)) out.costIfWrongEmpty += 1; else out.costIfWrongFilled += 1;
        const bet = c.soWhat?.bet ?? v2?.action?.what;
        if (empty(bet)) out.betEmpty += 1; else out.betFilled += 1;
        if (!empty(bet) && !empty(v2?.observe?.metric) && bet!.trim() === v2!.observe!.metric.trim()) out.betEqualsMetric += 1;
    }
    return out;
}
