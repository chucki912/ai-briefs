/** 구조화 체크 단위 테스트 (외부 API 불필요). npx tsx scripts/test-structured-checks.ts */
import {
    c1_allFactsSourced, c2_allSourcesResolved, c4_restsOnValid, c5prime_killTriggerFuture,
    c9prime_actRequiresHigh, c10_actComplete, c11_observeHasMetric, c12_noneIsEmpty,
    c13_highRequiresBinding, c14_minDistinctOutlets, c6_batchDupPairs, checkCard,
} from '../src/lib/analyzers/structured-checks';
import type { IssueItem, KeyFactStructured, KeyInsightStructured, SourceRef, SoWhatV2 } from '../src/types';

let pass = 0, fail = 0;
const chk = (name: string, cond: boolean, d?: string) => { if (cond) { pass++; console.log(`[PASS] ${name}`); } else { fail++; console.log(`[FAIL] ${name}${d ? ' — ' + d : ''}`); } };

const facts: KeyFactStructured[] = [
    { id: 'f1', text: 'A', sourceIds: ['s1'] },
    { id: 'f2', text: 'B', sourceIds: ['s2', 's3'] },
];
const sources: SourceRef[] = [
    { id: 's1', url: 'https://reuters.com/a', outlet: 'Reuters', resolved: true },
    { id: 's2', url: 'https://theverge.com/b', outlet: 'Verge', resolved: true },
    { id: 's3', url: 'https://bloomberg.com/c', outlet: 'Bloomberg', resolved: true },
];
const insight: KeyInsightStructured = { text: 'x', claimType: 'inferred', restsOnFactIds: ['f1', 'f2'], confidence: 'high', mundaneAlternative: 'boring' };
const swAct: SoWhatV2 = { ifInferenceHolds: 'a', unknown: 'b', actionType: 'act', action: { what: 'do', reversible: true, costIfWrong: 'c', costIfMissed: 'd' }, killTrigger: '2027년 12월 31일까지 50% 미달' };

// C1
chk('C1 무출처 fact 탐지', c1_allFactsSourced([{ id: 'f1', text: 'x', sourceIds: [] }]).length > 0);
chk('C1 정상', c1_allFactsSourced(facts).length === 0);
// C2
chk('C2 google 도메인 탐지', c2_allSourcesResolved([{ id: 's1', url: 'https://news.google.com/x' }]).length > 0);
chk('C2 resolved:false 탐지', c2_allSourcesResolved([{ id: 's1', url: 'https://reuters.com/a', resolved: false }]).length > 0);
chk('C2 정상', c2_allSourcesResolved(sources).length === 0);
// C4
chk('C4 dangling 탐지', c4_restsOnValid({ ...insight, restsOnFactIds: ['f9'] }, facts).length > 0);
chk('C4 빈 restsOn 탐지', c4_restsOnValid({ ...insight, restsOnFactIds: [] }, facts).length > 0);
chk('C4 정상', c4_restsOnValid(insight, facts).length === 0);
// C5' (날짜 기반, now 고정 주입)
const NOW = new Date('2026-07-16');
chk("C5' 만료 날짜 탐지", c5prime_killTriggerFuture({ ...swAct, killTrigger: '2025년 4분기 실적에서 15% 이하' }, NOW).length > 0);
chk("C5' 과거 연도 탐지", c5prime_killTriggerFuture({ ...swAct, killTrigger: '2025-12-31까지' }, NOW).length > 0);
chk("C5' 미래 날짜 정상", c5prime_killTriggerFuture({ ...swAct, killTrigger: '2026년 12월 31일까지' }, NOW).length === 0);
chk("C5' 날짜없는 수치임계 정상", c5prime_killTriggerFuture({ ...swAct, killTrigger: '월간 변동성이 5% 미만으로' }, NOW).length === 0);
chk("C5' 날짜·수치 모두 없음 탐지", c5prime_killTriggerFuture({ ...swAct, killTrigger: '상황이 나빠지면' }, NOW).length > 0);
// C9'
chk("C9' act+low 탐지", c9prime_actRequiresHigh(swAct, { ...insight, confidence: 'low' }).length > 0);
chk("C9' act+high 정상", c9prime_actRequiresHigh(swAct, insight).length === 0);
// C10
chk('C10 불완전 action 탐지', c10_actComplete({ ...swAct, action: { what: 'x', reversible: true, costIfWrong: '', costIfMissed: 'd' } }).length > 0);
chk('C10 정상', c10_actComplete(swAct).length === 0);
// C11
chk('C11 metric 없음 탐지', c11_observeHasMetric({ ...swAct, actionType: 'observe', action: undefined, observe: { metric: '', cadence: 'd' } }).length > 0);
chk('C11 정상', c11_observeHasMetric({ ...swAct, actionType: 'observe', action: undefined, observe: { metric: 'X 건수', cadence: '주간' } }).length === 0);
// C12
chk('C12 none인데 action 존재 탐지', c12_noneIsEmpty({ ...swAct, actionType: 'none' }).length > 0);
chk('C12 정상', c12_noneIsEmpty({ ...swAct, actionType: 'none', action: undefined }).length === 0);
// C13 (high 결박 자격: restsOn fact ≥2 + outlets ≥3)
chk('C13 high + 결박 충분 정상', c13_highRequiresBinding(insight, facts, sources).length === 0);
chk('C13 high인데 outlet 부족 탐지', c13_highRequiresBinding(insight, [{ id: 'f1', text: 'A', sourceIds: ['s1'] }, { id: 'f2', text: 'B', sourceIds: ['s2'] }], sources).length > 0);
chk('C13 high인데 restsOn fact 부족 탐지', c13_highRequiresBinding({ ...insight, restsOnFactIds: ['f2'] }, facts, sources).length > 0);
chk('C13 medium은 비적용', c13_highRequiresBinding({ ...insight, confidence: 'medium', restsOnFactIds: ['f1'] }, facts, sources).length === 0);
// C14 (무조건부 outlet 하한)
chk('C14 단일 outlet 탐지', c14_minDistinctOutlets([sources[0]]).length > 0);
chk('C14 동일 outlet 복수 기사 탐지', c14_minDistinctOutlets([
    { id: 's1', url: 'https://techcrunch.com/a', outlet: 'TechCrunch AI' },
    { id: 's2', url: 'https://techcrunch.com/b', outlet: 'TechCrunch AI' },
]).length > 0);
chk('C14 outlet 2개 정상', c14_minDistinctOutlets(sources.slice(0, 2)).length === 0);
// BD: outlet 정규화 — host(url) 기준
chk('BD 라벨 상이·동일 host = 1 outlet 탐지', c14_minDistinctOutlets([
    { id: 's1', url: 'https://techcrunch.com/a', outlet: 'TechCrunch AI' },
    { id: 's2', url: 'https://www.techcrunch.com/b', outlet: 'techcrunch.com' },
]).length > 0);
chk('BD 검색기 라벨 뭉개짐 해소(실 host 2개 = 정상)', c14_minDistinctOutlets([
    { id: 's1', url: 'https://fortune.com/x', outlet: 'Tavily Search' },
    { id: 's2', url: 'https://www.cbsnews.com/y', outlet: 'Tavily Search' },
]).length === 0);
// BE: 자사 채널 미계상
chk('BE 보도자료는 독립 outlet 아님(1 독립 → 탐지)', c14_minDistinctOutlets([
    sources[0],
    { id: 's9', url: 'https://news.microsoft.com/x', outlet: 'news.microsoft.com' },
]).length > 0);
chk('BE newsroom/investor 패턴 탐지', c14_minDistinctOutlets([
    { id: 's1', url: 'https://newsroom.acme.com/a', outlet: 'Acme' },
    { id: 's2', url: 'https://investor.acme.com/b', outlet: 'Acme IR' },
]).length > 0);
chk('BE 프레스 있어도 독립 2개면 정상', c14_minDistinctOutlets([
    sources[0], sources[1],
    { id: 's9', url: 'https://news.microsoft.com/x', outlet: 'news.microsoft.com' },
]).length === 0);
// C6
const card = (urls: string[]): IssueItem => ({ headline: 'h', keyFacts: [], insight: '', framework: '', sources: urls });
chk('C6 교집합 병합후보', c6_batchDupPairs([card(['u1', 'u2']), card(['u1', 'u2', 'u3'])]).length === 1);
chk('C6 무교집합', c6_batchDupPairs([card(['u1']), card(['u2'])]).length === 0);
// checkCard 통합
const goodCard: IssueItem = {
    headline: 'h', keyFacts: ['A', 'B'], insight: 'x', framework: 'none', sources: ['https://reuters.com/a', 'https://theverge.com/b'],
    structuredFacts: facts, sourceRefs: sources, keyInsight: insight, soWhatV2: swAct,
};
chk('checkCard 정상 카드 PASS', checkCard(goodCard, NOW).ok);
chk('checkCard 구조 누락 탐지', checkCard(card(['u1']), NOW).hasError);

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
