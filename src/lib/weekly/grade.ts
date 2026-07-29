/**
 * PASS 3 — 등급 확정 (결정론적 계산) (T3)
 *
 * 스펙 PASS 3(권위):
 *   hasInternalPrior = priorEvidence.some(e => e.source === 'internal')
 *   A 확립  : priorWeeksInternal >= 3 AND motionTypes.length >= 2 AND hasInternalPrior
 *   B 형성중: (priorWeeksInternal 1~2 OR 웹 근거 존재) AND motionTypes.length >= 1
 *   C 관찰  : 선행 근거 1건 이상 존재하나 위 요건 미달
 *   미충족  : demoted
 *   ※ 웹 근거만 있는 스레드는 A 불가(상한 B). A가 hasInternalPrior를 요구하므로 자동 보장.
 *
 * 하드 게이트(PASS 2: observedDates>=2 AND publisherCount>=2)를 통과한 스레드만
 * 이 함수에 도달한다. motionTypes는 PASS 2 후보(T3) 또는 PASS 4 확정본(T5)이 들어온다.
 * 동일 함수를 두 시점에 재사용한다(PASS 4가 motionType을 정리한 뒤 재등급).
 *
 * 순수 함수 — 부수효과 없음.
 */
import type { ThreadIndexEntry } from '@/types';
import type { MotionCandidates } from './types';
import { recentIsoWeekKeys } from '../thread-index';

export type Grade = 'A' | 'B' | 'C' | 'demoted';
export type MotionTypeCode = 'M1' | 'M2' | 'M3' | 'M4' | 'M5';

/** 과거 근거 1건. internal(threadIndex 관측)과 web(PASS 2.5)을 절대 섞어 세지 않는다. */
export interface PriorEvidence {
    source: 'internal' | 'web';
    // internal: isoWeek 또는 관측일(검증된 브리프 일자) / web: 모델주장 발행일(저신뢰 — quote 미결속).
    // [B-4] web observedAt는 'asOf 이전 선행' 불리언으로만 쓰고 M2·정량 앵커 금지(prior-boost.ts C-7 주석).
    observedAt: string;
    url?: string;
    quote?: string;
    mechanismNote?: string;
}

export interface GradeInput {
    priorWeeksInternal: number;
    motionTypes: MotionTypeCode[];
    priorEvidence: PriorEvidence[];
}

export interface GradeResult {
    grade: Grade;
    rationale: string;
    hasInternalPrior: boolean;
    hasWebEvidence: boolean;
}

/** 등급 임계값(튜닝 단일 지점). */
export const GRADE_CONFIG = {
    A_MIN_PRIOR_WEEKS: 3,
    A_MIN_MOTION_TYPES: 2,
    B_MIN_MOTION_TYPES: 1,
    B_PRIOR_WEEKS_RANGE: [1, 2] as [number, number],
};

/** PASS 2 운동유형 후보(M1/M2/M4)를 코드 배열로. M3/M5는 PASS 4 근거 제시 시에만 추가. */
export function candidateMotionTypes(mc: MotionCandidates): MotionTypeCode[] {
    const out: MotionTypeCode[] = [];
    if (mc.M1) out.push('M1');
    if (mc.M2) out.push('M2');
    if (mc.M4) out.push('M4');
    return out;
}

/**
 * threadIndex 관측에서 internal 과거 근거를 생성(창 내 관측된 주차마다 1건).
 * hasInternalPrior 판정과 M1 근거의 단일 원천. web 근거(PASS 2.5)와 별도.
 */
export function internalPriorEvidence(
    entry: ThreadIndexEntry | null | undefined,
    asOf: string | Date,
    windowWeeks = 8,
): PriorEvidence[] {
    if (!entry?.weeklyCounts) return [];
    const windowSet = new Set(recentIsoWeekKeys(asOf, windowWeeks));
    return Object.entries(entry.weeklyCounts)
        .filter(([wk, c]) => c > 0 && windowSet.has(wk))
        .map(([wk]) => ({
            source: 'internal' as const,
            observedAt: wk,
            mechanismNote: `threadIndex 내부 관측(${entry.threadKey})`,
        }));
}

/** 등급 산정. 스펙 PASS 3 규칙을 문자 그대로 구현. */
export function assignGrade(input: GradeInput): GradeResult {
    const hasInternalPrior = input.priorEvidence.some(e => e.source === 'internal');
    const hasWebEvidence = input.priorEvidence.some(e => e.source === 'web');
    const m = input.motionTypes.length;
    const pw = input.priorWeeksInternal;
    const [bLo, bHi] = GRADE_CONFIG.B_PRIOR_WEEKS_RANGE;

    // A 확립
    if (pw >= GRADE_CONFIG.A_MIN_PRIOR_WEEKS && m >= GRADE_CONFIG.A_MIN_MOTION_TYPES && hasInternalPrior) {
        return { grade: 'A', hasInternalPrior, hasWebEvidence, rationale: `priorWeeksInternal=${pw}(>=3) AND motionTypes=${m}(>=2) AND 내부 선행근거` };
    }
    // B 형성중 — 웹 근거만인 경우 A는 위에서 이미 차단(hasInternalPrior 요구)되므로 상한 B 보장
    if (((pw >= bLo && pw <= bHi) || hasWebEvidence) && m >= GRADE_CONFIG.B_MIN_MOTION_TYPES) {
        return { grade: 'B', hasInternalPrior, hasWebEvidence, rationale: `(priorWeeksInternal=${pw}∈[${bLo},${bHi}] 또는 웹근거=${hasWebEvidence}) AND motionTypes=${m}(>=1)` };
    }
    // C 관찰 — 선행 근거 1건 이상 존재하나 위 미달
    if (hasInternalPrior || hasWebEvidence) {
        return { grade: 'C', hasInternalPrior, hasWebEvidence, rationale: `선행 근거 존재(internal=${hasInternalPrior}, web=${hasWebEvidence}) 그러나 A/B 요건 미달(priorWeeksInternal=${pw}, motionTypes=${m})` };
    }
    return { grade: 'demoted', hasInternalPrior, hasWebEvidence, rationale: `과거 근거 없음(priorWeeksInternal=${pw}, motionTypes=${m}) — 승격 불가` };
}
