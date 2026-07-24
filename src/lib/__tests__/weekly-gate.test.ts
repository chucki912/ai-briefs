/** 주간 PASS 0/2 순수 로직 테스트 (외부 API/KV 불필요).
 *  npx tsx src/lib/__tests__/weekly-gate.test.ts */
import { evaluateGate, m4CrossItemCandidate } from '../weekly/gate';
import { normalizeIssue } from '../weekly/corpus';
import { isoWeekKey } from '../thread-index';
import type { ClusterAssignment, ClusterMember, NormalizedItem } from '../weekly/types';
import type { IssueItem, ThreadIndexEntry } from '../../types';
import type { IndustryTag } from '../../configs/industry-tags';
import { SOURCE_TIERING } from '../validation-config';

let pass = 0, fail = 0;
const chk = (name: string, cond: boolean, d?: string) => {
    if (cond) { pass++; console.log(`[PASS] ${name}`); }
    else { fail++; console.log(`[FAIL] ${name}${d ? ' — ' + d : ''}`); }
};

const denyDomain = SOURCE_TIERING.AGGREGATOR_DENYLIST[0]; // 실제 denylist 항목(하드코딩 금지)

// ── m4CrossItemCandidate ─────────────────────────────────────────────────────
const mem = (itemId: string, tags: IndustryTag[]): ClusterMember => ({ itemId, industryTags: tags });
chk('M4: 단일 태그 → false', m4CrossItemCandidate([mem('a', ['semiconductor'])]) === false);
chk('M4: 단일 기사 복수 태그만 → false (교차 차단)',
    m4CrossItemCandidate([mem('a', ['semiconductor', 'ai_software'])]) === false);
chk('M4: 두 기사 두 태그 → true',
    m4CrossItemCandidate([mem('a', ['semiconductor']), mem('b', ['ai_software'])]) === true);
chk('M4: 한 기사 복수태그 + 다른 기사 → true(대표 배정 가능)',
    m4CrossItemCandidate([mem('a', ['semiconductor', 'ai_software']), mem('b', ['ai_software'])]) === true);
chk('M4: 두 기사 동일 단일태그 → false',
    m4CrossItemCandidate([mem('a', ['semiconductor']), mem('b', ['semiconductor'])]) === false);

// ── normalizeIssue ───────────────────────────────────────────────────────────
const issue = (over: Partial<IssueItem> = {}): IssueItem => ({
    headline: 'HBM 선주문 2배',
    keyFacts: ['월 14만장 (2026-06)', '전년比 2배'],
    insight: '판단 필드(제외되어야 함)',
    framework: 'x',
    sources: ['https://www.reuters.com/tech/a', 'https://reuters.com/tech/b', 'https://en.wikipedia.org/x'],
    ...over,
});
const n = normalizeIssue(issue(), '2026-07-20', 'ai', 0);
chk('normalize: itemId 형식', n.itemId === 'ai:2026-07-20#0');
chk('normalize: title=headline', n.title === 'HBM 선주문 2배');
chk('normalize: publisherDomains registrable+dedup(www/서브도메인 수렴)',
    n.publisherDomains.includes('reuters.com') && n.publisherDomains.includes('wikipedia.org') && n.publisherDomains.length === 2,
    JSON.stringify(n.publisherDomains));
chk('normalize: keyFacts fallback(structuredFacts)',
    normalizeIssue(issue({ keyFacts: [], structuredFacts: [{ id: 'f1', text: '구조화 사실', sourceIds: ['s1'] }] }), '2026-07-20', 'ai', 1).keyFacts[0] === '구조화 사실');

// ── evaluateGate ─────────────────────────────────────────────────────────────
const item = (over: Partial<NormalizedItem>): NormalizedItem => ({
    itemId: 'ai:2026-07-20#0', publishedAt: '2026-07-20', domain: 'ai',
    title: 't', keyFacts: ['수치 2배'], sourceUrls: [], publisherDomains: ['reuters.com'], ...over,
});
const mkMap = (items: NormalizedItem[]) => new Map(items.map(i => [i.itemId, i]));

// 통과 케이스: 2일 + 2출처
const itemsPass = [
    item({ itemId: 'i1', publishedAt: '2026-07-20', publisherDomains: ['reuters.com'], keyFacts: ['14만장'] }),
    item({ itemId: 'i2', publishedAt: '2026-07-22', publisherDomains: ['bloomberg.com'], keyFacts: ['20만장'] }),
];
const clusterPass: ClusterAssignment = {
    threadKey: 'hbm', label: 'HBM', matchedExisting: false,
    members: [mem('i1', ['semiconductor']), mem('i2', ['ai_software'])],
};
const gPass = evaluateGate(clusterPass, mkMap(itemsPass), null, { asOf: '2026-07-22' });
chk('gate: observedDates distinct 2', gPass.observedDates.length === 2);
chk('gate: publisherCount 2', gPass.publisherCount === 2);
chk('gate: hardGatePass true', gPass.hardGatePass === true);
chk('gate: demotedReasons 없음', gPass.demotedReasons.length === 0);
chk('gate: M2 후보(두 날짜 수치)', gPass.motionCandidates.M2 === true);
chk('gate: M4 후보(두 기사 두 태그)', gPass.motionCandidates.M4 === true);
chk('gate: M1 후보 없음(prior 없음)', gPass.motionCandidates.M1 === false);

// 단일 출처 강등
const itemsOneSrc = [
    item({ itemId: 'i1', publishedAt: '2026-07-20', publisherDomains: ['reuters.com'] }),
    item({ itemId: 'i2', publishedAt: '2026-07-22', publisherDomains: ['reuters.com'] }),
];
const gOneSrc = evaluateGate({ ...clusterPass, members: [mem('i1', ['semiconductor']), mem('i2', ['ai_software'])] }, mkMap(itemsOneSrc), null, { asOf: '2026-07-22' });
chk('gate: 단일 출처 → single_publisher 강등', !gOneSrc.hardGatePass && gOneSrc.demotedReasons.includes('single_publisher'));

// denylist 제외로 출처 1곳 → 강등
const itemsDeny = [
    item({ itemId: 'i1', publishedAt: '2026-07-20', publisherDomains: ['reuters.com'] }),
    item({ itemId: 'i2', publishedAt: '2026-07-22', publisherDomains: [denyDomain] }),
];
const gDeny = evaluateGate({ ...clusterPass, members: [mem('i1', ['semiconductor']), mem('i2', ['ai_software'])] }, mkMap(itemsDeny), null, { asOf: '2026-07-22' });
chk('gate: denylist 출처 제외되어 single_publisher', gDeny.publisherCount === 1 && gDeny.demotedReasons.includes('single_publisher'));

// 단일 일자 강등
const itemsOneDay = [
    item({ itemId: 'i1', publishedAt: '2026-07-20', publisherDomains: ['reuters.com'] }),
    item({ itemId: 'i2', publishedAt: '2026-07-20', publisherDomains: ['bloomberg.com'] }),
];
const gOneDay = evaluateGate({ ...clusterPass, members: [mem('i1', ['semiconductor']), mem('i2', ['ai_software'])] }, mkMap(itemsOneDay), null, { asOf: '2026-07-20' });
chk('gate: 단일 일자 → single_date 강등', !gOneDay.hardGatePass && gOneDay.demotedReasons.includes('single_date'));

// M1 후보: priorEntry에 최근 주차 관측
const priorEntry: ThreadIndexEntry = {
    threadKey: 'hbm', label: 'HBM', firstObservedAt: '2026-07-06', lastObservedAt: '2026-07-13',
    weeklyCounts: { [isoWeekKey('2026-07-13')]: 2 }, representativeMetrics: [], anchorSourceIds: [],
    domainTags: ['ai'], industryTags: ['semiconductor'],
};
const gM1 = evaluateGate(clusterPass, mkMap(itemsPass), priorEntry, { asOf: '2026-07-22' });
chk('gate: M1 후보(prior 1주 관측)', gM1.motionCandidates.M1 === true && gM1.priorWeeksInternal === 1);

console.log(`\n${fail === 0 ? '✅' : '❌'} weekly-gate: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
