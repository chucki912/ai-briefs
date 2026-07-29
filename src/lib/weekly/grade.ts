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
    /** [B-4] 관측 단위 legacy(구코드 산출물 = 시점 메타 미검증). A 산정 배제, B/C 근거로는 유효.
     *  web 근거는 항상 legacy 취급(observedAt이 모델주장 발행일 — C-7 갭). */
    legacy?: boolean;
    url?: string;
    quote?: string;
    mechanismNote?: string;
}

export interface GradeInput {
    priorWeeksInternal: number;
    /** [B-4] A 게이트 전용: non-legacy 관측만으로 계산한 선행 주차 수.
     *  미지정이면 priorWeeksInternal로 폴백(구 호출부 호환) — 단 A는 hasInternalPrior(non-legacy)도 요구. */
    priorWeeksNonLegacy?: number;
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
            legacy: isLegacyWeek(entry, wk),
            mechanismNote: `threadIndex 내부 관측(${entry.threadKey})`,
        }));
}

/**
 * [B-4] 해당 주 관측이 legacy인가 — 관측 단위 legacy 플래그로 판정(스레드 단위 낙인 아님).
 * non-legacy = 그 주 관측 중 legacy === false 인 항목이 하나라도 있음(= anchorSource 확인된 산출물).
 * weeklyObservations 자체가 없거나 플래그가 부재하면 판별 불가 → legacy(안전한 방향).
 */
export function isLegacyWeek(entry: Pick<ThreadIndexEntry, 'weeklyObservations'>, isoWeek: string): boolean {
    const obs = entry.weeklyObservations?.[isoWeek];
    if (!obs || obs.length === 0) return true;
    return !obs.some(o => o.legacy === false);
}

/**
 * [B-4] A 게이트용 선행 주차 수 — non-legacy 관측이 있는 주만 계상.
 * 창 안에 legacy가 남아 있어도 non-legacy만으로 >=3이면 A 부여 가능(legacy 소진 규칙).
 */
export function priorWeeksNonLegacy(
    entry: ThreadIndexEntry | null | undefined,
    asOf: string | Date,
    windowWeeks = 8,
): number {
    if (!entry?.weeklyCounts) return 0;
    const windowSet = new Set(recentIsoWeekKeys(asOf, windowWeeks));
    return Object.entries(entry.weeklyCounts)
        .filter(([wk, c]) => c > 0 && windowSet.has(wk) && !isLegacyWeek(entry, wk))
        .length;
}

/** 등급 산정. 스펙 PASS 3 규칙을 문자 그대로 구현. */
export function assignGrade(input: GradeInput): GradeResult {
    // B/C 산정: legacy 관측도 지속성 근거로 유효(포함).
    const hasInternalPrior = input.priorEvidence.some(e => e.source === 'internal');
    const hasWebEvidence = input.priorEvidence.some(e => e.source === 'web');
    // A 산정: legacy·web을 배제한 검증된 내부 관측만(B-5 (c) — 거짓 A 구조적 차단).
    const hasVerifiedInternalPrior = input.priorEvidence.some(e => e.source === 'internal' && e.legacy === false);
    const m = input.motionTypes.length;
    const pw = input.priorWeeksInternal;
    const pwA = input.priorWeeksNonLegacy ?? pw;   // A 게이트 전용(미지정 시 폴백)
    const [bLo, bHi] = GRADE_CONFIG.B_PRIOR_WEEKS_RANGE;

    // A 확립 — non-legacy 관측만으로 요건 충족해야 한다(legacy 관측만으론 A 불가).
    if (pwA >= GRADE_CONFIG.A_MIN_PRIOR_WEEKS && m >= GRADE_CONFIG.A_MIN_MOTION_TYPES && hasVerifiedInternalPrior) {
        return { grade: 'A', hasInternalPrior, hasWebEvidence, rationale: `priorWeeksNonLegacy=${pwA}(>=3) AND motionTypes=${m}(>=2) AND 검증된 내부 선행근거` };
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
