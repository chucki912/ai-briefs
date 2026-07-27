/** PASS 2.5 웹 보강 순수 검증 + 파이프라인 조건부 호출 테스트 (외부 API 불필요).
 *  npx tsx src/lib/__tests__/weekly-prior-boost.test.ts */
import { validateWebEvidence, parsePriorBoostResponse, parseObservedAt } from '../weekly/prior-boost';
import { runDeterministicPasses, type WebBoostContext } from '../weekly/pipeline';
import { InMemoryThreadIndexStore } from '../weekly/thread-index-store';
import { isoWeekKey } from '../thread-index';
import type { NormalizedItem } from '../weekly/types';
import type { PriorEvidence } from '../weekly/grade';
import type { IndustryTag } from '../../configs/industry-tags';

let pass = 0, fail = 0;
const chk = (name: string, cond: boolean, d?: string) => {
    if (cond) { pass++; console.log(`[PASS] ${name}`); }
    else { fail++; console.log(`[FAIL] ${name}${d ? ' — ' + d : ''}`); }
};

const asOf = '2026-07-20';
const ok = { url: 'https://reuters.com/x', quote: '전년 대비 2배 증가했다', observedAt: '2026-05', mechanismNote: '동일 공급 병목 메커니즘' };

// ── parseObservedAt ──────────────────────────────────────────────────────────
chk('observedAt: YYYY-MM', parseObservedAt('2026-05')?.iso === '2026-05');
chk('observedAt: YYYY-MM-DD', parseObservedAt('2026-05-14')?.iso === '2026-05-14');
chk('observedAt: 불량 → null', parseObservedAt('작년') === null);
chk('observedAt: 월범위 검증', parseObservedAt('2026-13') === null);

// ── validateWebEvidence (DoD#4: quote+observedAt 필수) ───────────────────────
chk('web: 정상 인정', (() => { const r = validateWebEvidence(ok, asOf); return !!r && r.source === 'web' && r.quote === ok.quote && r.observedAt === '2026-05'; })());
chk('web: quote 없으면 reject', validateWebEvidence({ ...ok, quote: '' }, asOf) === null);
chk('web: 발행일 없으면 reject', validateWebEvidence({ ...ok, observedAt: undefined }, asOf) === null);
chk('web: mechanismNote 없으면 reject', validateWebEvidence({ ...ok, mechanismNote: '' }, asOf) === null);
chk('web: URL 아니면 reject', validateWebEvidence({ ...ok, url: 'not-a-url' }, asOf) === null);
chk('web: asOf 이후(선행 아님) reject', validateWebEvidence({ ...ok, observedAt: '2026-08' }, asOf) === null);
chk('web: asOf 같은 달 이전일이면 인정', !!validateWebEvidence({ ...ok, observedAt: '2026-07-01' }, asOf));

// ── parsePriorBoostResponse ──────────────────────────────────────────────────
chk('parse: {evidence:[...]}', parsePriorBoostResponse('노이즈 {"evidence":[{"url":"u"}]} 끝').length === 1);
chk('parse: 빈 evidence', parsePriorBoostResponse('{"evidence":[]}').length === 0);
chk('parse: JSON 없음 → []', parsePriorBoostResponse('아무 텍스트').length === 0);

// ── 파이프라인 조건부 호출: pw==0 스레드에만 webBoost, 웹근거로 B 승격 ──
async function integration() {
    const store = new InMemoryThreadIndexStore();
    const item = (id: string, date: string, pub: string): NormalizedItem => ({ itemId: id, publishedAt: date, domain: 'ai', title: id, keyFacts: ['수치 2배'], sourceUrls: [], publisherDomains: [pub] });
    const tag = (t: IndustryTag) => t;

    // W1: t_seed 관측(다음 주 pw=1 만들기 위함)
    await runDeterministicPasses({
        dates: [], domain: 'ai', asOf: '2026-07-08', isoWeek: isoWeekKey('2026-07-08'), store, persist: true,
        items: [item('a', '2026-07-06', 'reuters.com'), item('b', '2026-07-08', 'bloomberg.com')],
        clusterFn: async () => [{ threadKey: 't_seed', label: 'S', matchedExisting: false, members: [{ itemId: 'a', industryTags: [tag('semiconductor')] }, { itemId: 'b', industryTags: [tag('ai_software')] }] }],
    });

    // W2: t_seed(matched, pw=1) + t_new(pw=0). webBoost 스파이.
    const boostCalls: string[] = [];
    const webBoost = async (ctx: WebBoostContext): Promise<PriorEvidence[]> => {
        boostCalls.push(ctx.threadKey);
        return [{ source: 'web', observedAt: '2026-05', url: 'https://reuters.com/prior', quote: '동일 메커니즘 원문', mechanismNote: '메커니즘 일치' }];
    };
    const w2 = await runDeterministicPasses({
        dates: [], domain: 'ai', asOf: '2026-07-15', isoWeek: isoWeekKey('2026-07-15'), store, persist: true, webBoost,
        items: [item('c', '2026-07-13', 'reuters.com'), item('d', '2026-07-15', 'bloomberg.com'), item('e', '2026-07-13', 'ft.com'), item('f', '2026-07-15', 'wsj.com')],
        clusterFn: async () => [
            { threadKey: 't_seed', label: 'S', matchedExisting: true, members: [{ itemId: 'c', industryTags: [tag('semiconductor')] }, { itemId: 'd', industryTags: [tag('ai_software')] }] },
            { threadKey: 't_new', label: 'N', matchedExisting: false, members: [{ itemId: 'e', industryTags: [tag('semiconductor')] }, { itemId: 'f', industryTags: [tag('ai_software')] }] },
        ],
    });

    chk('pipeline: webBoost는 pw==0(t_new)에만 호출', boostCalls.length === 1 && boostCalls[0] === 't_new', JSON.stringify(boostCalls));
    const tNew = w2.promoted.find(g => g.threadKey === 't_new');
    chk('pipeline: 웹근거로 t_new 승격', !!tNew, w2.promoted.map(p => p.threadKey).join(','));
    chk('pipeline: t_new grade=B(웹근거 & motion>=1)', tNew?.grade === 'B', tNew?.grade);
    chk('pipeline: t_new priorEvidence에 web 존재', tNew?.priorEvidence.some(e => e.source === 'web') === true);
    chk('pipeline: t_new에 internal 근거 없음(섞이지 않음)', tNew?.priorEvidence.every(e => e.source === 'web') === true);
    const tSeed = w2.promoted.find(g => g.threadKey === 't_seed');
    chk('pipeline: t_seed(pw=1)는 internal만', tSeed?.priorEvidence.every(e => e.source === 'internal') === true);

    console.log(`\n${fail === 0 ? '✅' : '❌'} weekly-prior-boost: ${pass} passed, ${fail} failed`);
    if (fail > 0) process.exit(1);
}
integration();
