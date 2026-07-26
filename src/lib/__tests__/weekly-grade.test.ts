/** PASS 3 등급 확정 순수 로직 테스트 (외부 API 불필요).
 *  npx tsx src/lib/__tests__/weekly-grade.test.ts */
import { assignGrade, candidateMotionTypes, internalPriorEvidence, type PriorEvidence, type MotionTypeCode } from '../weekly/grade';
import { isoWeekKey } from '../thread-index';
import type { ThreadIndexEntry } from '../../types';

let pass = 0, fail = 0;
const chk = (name: string, cond: boolean, d?: string) => {
    if (cond) { pass++; console.log(`[PASS] ${name}`); }
    else { fail++; console.log(`[FAIL] ${name}${d ? ' — ' + d : ''}`); }
};

const internal = (n: number): PriorEvidence[] => Array.from({ length: n }, (_, i) => ({ source: 'internal' as const, observedAt: `2026-W${20 + i}` }));
const web = (n: number): PriorEvidence[] => Array.from({ length: n }, (_, i) => ({ source: 'web' as const, observedAt: '2026-06-01', url: 'https://x.com', quote: 'q' }));
const M = (...xs: MotionTypeCode[]) => xs;

// ── A 확립 ───────────────────────────────────────────────────────────────────
chk('A: pw>=3 & motion>=2 & internal', assignGrade({ priorWeeksInternal: 3, motionTypes: M('M1', 'M2'), priorEvidence: internal(3) }).grade === 'A');
chk('A: pw=2면 A 불가 → B', assignGrade({ priorWeeksInternal: 2, motionTypes: M('M1', 'M2'), priorEvidence: internal(2) }).grade === 'B');
chk('A: motion 1개면 A 불가', assignGrade({ priorWeeksInternal: 4, motionTypes: M('M1'), priorEvidence: internal(4) }).grade !== 'A');

// ── 웹 전용 상한 B (A 불가) ──────────────────────────────────────────────────
const webOnly = assignGrade({ priorWeeksInternal: 0, motionTypes: M('M1', 'M2', 'M4'), priorEvidence: web(3) });
chk('웹 전용: A 불가(내부 선행 없음)', webOnly.grade !== 'A' && webOnly.grade === 'B', webOnly.grade);
chk('웹 전용: hasInternalPrior=false', webOnly.hasInternalPrior === false && webOnly.hasWebEvidence === true);
// DoD #3: 웹 근거만 보유한 스레드가 A면 fail — 여기서 A가 아님을 보장
chk('DoD#3: pw>=3이라도 내부근거 없이 웹만이면 A 불가', assignGrade({ priorWeeksInternal: 3, motionTypes: M('M1', 'M2'), priorEvidence: web(3) }).grade !== 'A');

// ── B 형성중 ─────────────────────────────────────────────────────────────────
chk('B: pw=1 & motion>=1', assignGrade({ priorWeeksInternal: 1, motionTypes: M('M1'), priorEvidence: internal(1) }).grade === 'B');
chk('B: 웹근거 & motion>=1', assignGrade({ priorWeeksInternal: 0, motionTypes: M('M2'), priorEvidence: web(1) }).grade === 'B');

// ── C 관찰 ───────────────────────────────────────────────────────────────────
chk('C: 선행근거 있으나 motion 0', assignGrade({ priorWeeksInternal: 1, motionTypes: [], priorEvidence: internal(1) }).grade === 'C');
// 경계 케이스(문자적 스펙): pw>=3 & motion==1 → A/B 불가 → C (플래그된 경계)
chk('경계: pw>=3 & motion==1 → C(문자적 스펙)', assignGrade({ priorWeeksInternal: 4, motionTypes: M('M1'), priorEvidence: internal(4) }).grade === 'C');

// ── demoted ──────────────────────────────────────────────────────────────────
chk('demoted: 과거 근거 전무', assignGrade({ priorWeeksInternal: 0, motionTypes: M('M1'), priorEvidence: [] }).grade === 'demoted');
chk('demoted: pw=0 motion=0 근거없음', assignGrade({ priorWeeksInternal: 0, motionTypes: [], priorEvidence: [] }).grade === 'demoted');

// ── candidateMotionTypes ─────────────────────────────────────────────────────
chk('motionTypes: M1/M2/M4 필터', JSON.stringify(candidateMotionTypes({ M1: true, M2: false, M4: true })) === JSON.stringify(['M1', 'M4']));

// ── internalPriorEvidence ────────────────────────────────────────────────────
const entry: ThreadIndexEntry = {
    threadKey: 't', label: 'L', firstObservedAt: '2026-06-01', lastObservedAt: '2026-07-13',
    weeklyCounts: { [isoWeekKey('2026-07-13')]: 2, [isoWeekKey('2026-07-06')]: 1, [isoWeekKey('2026-05-01')]: 3 },
    representativeMetrics: [], anchorSourceIds: [], domainTags: ['ai'], industryTags: ['semiconductor'],
};
const ipe = internalPriorEvidence(entry, '2026-07-20', 8);
chk('internalPriorEvidence: 창 내 관측주만(2건, 창밖 05-01 제외)', ipe.length === 2, `got ${ipe.length}`);
chk('internalPriorEvidence: 전부 source=internal', ipe.every(e => e.source === 'internal'));
chk('internalPriorEvidence: null 안전', internalPriorEvidence(null, '2026-07-20').length === 0);

console.log(`\n${fail === 0 ? '✅' : '❌'} weekly-grade: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
