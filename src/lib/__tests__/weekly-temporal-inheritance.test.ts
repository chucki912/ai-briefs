/**
 * B-4 DoD — rule 3 주간 상속 + legacy 격리 (결정론 검증).
 *
 * DoD:
 *  1. legacy 관측만으로 A등급이 부여되는 케이스 0건
 *  2. legacy 판별이 anchorSource 필드 기준으로 동작(날짜 아님)
 *  3. non-legacy pw>=3 도달 시 A 부여 정상 동작(합성 케이스)
 * + rule 3 본체: observedDates current만 / M2 12개월 / 앵커 신뢰도
 */
import { assignGrade, internalPriorEvidence, priorWeeksNonLegacy, isLegacyWeek, type PriorEvidence, type MotionTypeCode } from '../weekly/grade';
import { currentObservedDates, m2CandidateWithTemporal, monthsAgo, isQuoteAnchored, datedBackgroundFacts, quantitativeAnchorFacts } from '../weekly/temporal-inheritance';
import { normalizeIssue } from '../weekly/corpus';
import { findInternalVocab, validateWeeklyThread } from '../weekly/validate-weekly';
import type { NormalizedItem } from '../weekly/types';
import type { ThreadIndexEntry, IssueItem } from '@/types';

let pass = 0, fail = 0;
const chk = (name: string, cond: boolean, d?: string) => {
    if (cond) { pass++; console.log(`[PASS] ${name}`); }
    else { fail++; console.log(`[FAIL] ${name}${d ? ' — ' + d : ''}`); }
};
const M = (...xs: MotionTypeCode[]) => xs;

const item = (over: Partial<NormalizedItem> = {}): NormalizedItem => ({
    itemId: 'ai:2026-07-20#0', publishedAt: '2026-07-20', domain: 'ai', title: 't',
    keyFacts: ['수치 2배'], facts: [{ text: '수치 2배' }], hasAnchorSource: false,
    sourceUrls: [], publisherDomains: ['reuters.com'], ...over,
});
const fa = (value: string, anchorSource: 'quote' | 'sourcePublishedAt' | 'none', evidence: string | null = 'q') =>
    ({ value, evidence, anchorSource } as const);

// ── DoD 1: legacy 관측만으로 A 불가 ─────────────────────────────────────────
const legacyOnly: PriorEvidence[] = [0, 1, 2, 3].map(i => ({ source: 'internal' as const, observedAt: `2026-W2${i}`, legacy: true }));
chk('DoD1: legacy 관측 4주 + motion 2개 → A 불가(B 이하)',
    assignGrade({ priorWeeksInternal: 4, priorWeeksNonLegacy: 0, motionTypes: M('M1', 'M2'), priorEvidence: legacyOnly }).grade !== 'A');
chk('DoD1: legacy 관측은 B 근거로는 유효',
    ['B', 'C'].includes(assignGrade({ priorWeeksInternal: 4, priorWeeksNonLegacy: 0, motionTypes: M('M1', 'M2'), priorEvidence: legacyOnly }).grade));
chk('DoD1: web 근거만으로도 A 불가(C-7 갭 — web은 legacy 취급)',
    assignGrade({ priorWeeksInternal: 0, priorWeeksNonLegacy: 0, motionTypes: M('M1', 'M2'), priorEvidence: [{ source: 'web', observedAt: '2026-05', legacy: true, url: 'https://x', quote: 'q' }] }).grade !== 'A');

// ── DoD 2: legacy 판별 = anchorSource 필드 기준(날짜 아님) ──────────────────
const issue = (over: Partial<IssueItem> = {}): IssueItem => ({
    headline: 'h', keyFacts: ['f1'], insight: 'i', framework: 'none', sources: ['https://reuters.com/a'],
    sourceRefs: [{ id: 's1', url: 'https://reuters.com/a' }], ...over,
} as IssueItem);
const oldBrief = normalizeIssue(issue({ structuredFacts: [{ id: 'f1', text: '구코드 사실', sourceIds: ['s1'] }] }), '2026-07-29', 'ai', 0);
const newBrief = normalizeIssue(issue({ structuredFacts: [{ id: 'f1', text: '신코드 사실', sourceIds: ['s1'], factAssertedAt: fa('2026-07', 'sourcePublishedAt', null), temporalRole: 'current' }] }), '2026-06-01', 'ai', 0);
chk('DoD2: anchorSource 부재 → legacy(날짜가 최신이어도)', oldBrief.hasAnchorSource === false);
chk('DoD2: anchorSource 존재 → non-legacy(날짜가 과거여도)', newBrief.hasAnchorSource === true);
chk('DoD2: 구조화 fact 없음(구코드 battery) → 판별불가 → legacy',
    normalizeIssue(issue({ keyFacts: ['평문만'] }), '2026-07-30', 'battery', 0).hasAnchorSource === false);
const entryMixed: ThreadIndexEntry = {
    threadKey: 't', label: 'l', firstObservedAt: '2026-06-01', lastObservedAt: '2026-07-20',
    weeklyCounts: { '2026-W24': 1, '2026-W25': 1, '2026-W30': 1 },
    weeklyObservations: {
        '2026-W24': [{ itemId: 'a', observedAt: '2026-06-08', title: 't', sourceUrls: [] }],                  // 플래그 부재 → legacy
        '2026-W25': [{ itemId: 'b', observedAt: '2026-06-15', title: 't', sourceUrls: [], legacy: true }],     // 명시 legacy
        '2026-W30': [{ itemId: 'c', observedAt: '2026-07-20', title: 't', sourceUrls: [], legacy: false }],    // non-legacy
    },
    participants: [], representativeMetrics: [], anchorSourceIds: [], domainTags: ['ai'], industryTags: [],
};
chk('DoD2: 플래그 부재 주 → legacy(안전한 방향)', isLegacyWeek(entryMixed, '2026-W24') === true);
chk('DoD2: legacy:true 주 → legacy', isLegacyWeek(entryMixed, '2026-W25') === true);
chk('DoD2: legacy:false 주 → non-legacy', isLegacyWeek(entryMixed, '2026-W30') === false);
chk('DoD2: weeklyObservations 없는 주 → legacy', isLegacyWeek({ weeklyObservations: {} }, '2026-W30') === true);
const asOf = '2026-07-27';
chk('DoD2: priorWeeksNonLegacy는 non-legacy 주만 계상(1)', priorWeeksNonLegacy(entryMixed, asOf) === 1);
chk('DoD2: internalPriorEvidence가 주별 legacy를 표기',
    internalPriorEvidence(entryMixed, asOf).filter(e => e.legacy === false).length === 1);

// ── DoD 3: non-legacy pw>=3 → A 정상 부여 (legacy 잔존해도) ────────────────
const entryConverged: ThreadIndexEntry = {
    ...entryMixed,
    weeklyCounts: { '2026-W24': 1, '2026-W28': 1, '2026-W29': 1, '2026-W30': 1 },
    weeklyObservations: {
        '2026-W24': [{ itemId: 'a', observedAt: '2026-06-08', title: 't', sourceUrls: [] }],                 // legacy 잔존
        '2026-W28': [{ itemId: 'x', observedAt: '2026-07-06', title: 't', sourceUrls: [], legacy: false }],
        '2026-W29': [{ itemId: 'y', observedAt: '2026-07-13', title: 't', sourceUrls: [], legacy: false }],
        '2026-W30': [{ itemId: 'z', observedAt: '2026-07-20', title: 't', sourceUrls: [], legacy: false }],
    },
};
const pwNL = priorWeeksNonLegacy(entryConverged, asOf);
chk('DoD3: non-legacy 3주 계상', pwNL === 3, `pwNonLegacy=${pwNL}`);
chk('DoD3: legacy 잔존해도 non-legacy pw>=3이면 A 부여',
    assignGrade({ priorWeeksInternal: 4, priorWeeksNonLegacy: pwNL, motionTypes: M('M1', 'M2'), priorEvidence: internalPriorEvidence(entryConverged, asOf) }).grade === 'A');

// ── rule 3 본체 ─────────────────────────────────────────────────────────────
chk('rule3: observedDates는 current 사실 있는 날짜만',
    currentObservedDates([
        item({ itemId: 'a', publishedAt: '2026-07-20', hasAnchorSource: true, facts: [{ text: 'x', temporalRole: 'current' }] }),
        item({ itemId: 'b', publishedAt: '2026-07-21', hasAnchorSource: true, facts: [{ text: 'y', temporalRole: 'background' }] }),
    ]).join(',') === '2026-07-20');
chk('rule3: facts 미탑재(구코드)는 날짜 인정(전량 강등 방지)',
    currentObservedDates([item({ publishedAt: '2026-07-22', facts: [] })]).join(',') === '2026-07-22');
chk('rule3: M2는 quote 앵커 2시점 + 최근 12개월 이내 → 인정',
    m2CandidateWithTemporal([
        item({ itemId: 'a', hasAnchorSource: true, facts: [{ text: '40%', factAssertedAt: fa('2026-07', 'quote'), temporalRole: 'current' }] }),
        item({ itemId: 'b', hasAnchorSource: true, facts: [{ text: '30%', factAssertedAt: fa('2025-12', 'quote'), temporalRole: 'background' }] }),
    ], asOf) === true);
chk('rule3: M2 양쪽 모두 12개월 초과 → 불인정',
    m2CandidateWithTemporal([
        item({ itemId: 'a', hasAnchorSource: true, facts: [{ text: '40%', factAssertedAt: fa('2024-01', 'quote') }] }),
        item({ itemId: 'b', hasAnchorSource: true, facts: [{ text: '30%', factAssertedAt: fa('2023-01', 'quote') }] }),
    ], asOf) === false);
chk('rule3: M2는 발행일 앵커(sourcePublishedAt) 배제',
    m2CandidateWithTemporal([
        item({ itemId: 'a', hasAnchorSource: true, facts: [{ text: '40%', factAssertedAt: fa('2026-07', 'sourcePublishedAt', null) }] }),
        item({ itemId: 'b', hasAnchorSource: true, facts: [{ text: '30%', factAssertedAt: fa('2026-01', 'sourcePublishedAt', null) }] }),
    ], asOf) === false);
chk('rule3: monthsAgo 연도만 → 연말 기준 보수 계산', monthsAgo('2025', '2026-07-27') === 7);
chk('rule3: unknown은 시점 앵커 불가', isQuoteAnchored({ text: 'x', factAssertedAt: fa('unknown', 'quote', null) }) === false);
chk('rule3: [배경] 슬롯은 시점 확인된 background만',
    datedBackgroundFacts([
        item({ hasAnchorSource: true, facts: [
            { text: '2024년 40%', factAssertedAt: fa('2024', 'quote'), temporalRole: 'background' },
            { text: '시점불명 배경', factAssertedAt: fa('unknown', 'none', null), temporalRole: 'background' },
        ] }),
    ]).length === 1);
chk('rule3: 정량 앵커는 quote+current만(unknown·발행일앵커 제외)',
    quantitativeAnchorFacts([
        item({ hasAnchorSource: true, facts: [
            { text: 'ok', factAssertedAt: fa('2026-07', 'quote'), temporalRole: 'current' },
            { text: 'no1', factAssertedAt: fa('2026-07', 'sourcePublishedAt', null), temporalRole: 'current' },
            { text: 'no2', factAssertedAt: fa('unknown', 'none', null), temporalRole: 'current' },
        ] }),
    ]).length === 1);

// ── B-6 후속: 내부 어휘 노출 결정론 검사(dry-run 실측 결함) ─────────────────
const leaked = '만약 M1 유형의 초기 시그널처럼 경쟁이 지속·확대되면 시장 수요 반등이 앞당겨진다.';
chk('vocab: dry-run에서 실제 노출된 M1 문장 적발', findInternalVocab(leaked).length > 0, JSON.stringify(findInternalVocab(leaked)));
chk('vocab: M4 확산 표기 적발', findInternalVocab('다수 이종 산업군으로 확산(M4)되면').length > 0);
chk('vocab: 정상 서술은 통과', findInternalVocab('여러 산업으로 번지는 양상이 지속되면 락인 효과가 발생한다.').length === 0);
chk('vocab: 킬 트리거·승격·게이트 적발',
    findInternalVocab('킬 트리거').length > 0 && findInternalVocab('승격 요건').length > 0 && findInternalVocab('게이트 통과').length > 0);
const leakThread = {
    threadKey: 't', label: 'l', grade: 'B' as const, observedDates: ['2026-07-29', '2026-07-30'],
    background: '배경'.repeat(60), mainContent: '내용'.repeat(300), implications: leaked + '판단'.repeat(60),
    nextWeekCheck: '확인', killTrigger: '2026-09-30까지 30% 이하면 철회', metricsUsed: ['40%'],
    table: { headers: ['a', 'b'], rows: [['1', '2'], ['3', '4']] }, motionTypes: ['M1' as const],
};
chk('vocab: validateWeeklyThread가 hard 위반으로 잡음(재생성→강등 경로)',
    validateWeeklyThread(leakThread as never).some(f => f.rule === 'internal_vocab_exposed' && f.severity === 'hard'));

console.log(`\n${fail === 0 ? '✅' : '❌'} weekly-temporal-inheritance: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
