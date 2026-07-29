/** PASS 0-3 런타임(runDeterministicPasses) 통합 테스트 — 클러스터링 주입(LLM 불필요).
 *  npx tsx src/lib/__tests__/weekly-pipeline.test.ts */
import { runDeterministicPasses } from '../weekly/pipeline';
import { InMemoryThreadIndexStore } from '../weekly/thread-index-store';
import { isoWeekKey } from '../thread-index';
import type { NormalizedItem, ClusterAssignment } from '../weekly/types';
import type { IndustryTag } from '../../configs/industry-tags';

let pass = 0, fail = 0;
const chk = (name: string, cond: boolean, d?: string) => {
    if (cond) { pass++; console.log(`[PASS] ${name}`); }
    else { fail++; console.log(`[FAIL] ${name}${d ? ' — ' + d : ''}`); }
};

const item = (id: string, date: string, pub: string): NormalizedItem => ({
    itemId: id, publishedAt: date, domain: 'ai', title: id,
    keyFacts: ['수치 2배 증가'], facts: [{ text: '수치 2배 증가' }], hasAnchorSource: false,
    sourceUrls: [], publisherDomains: [pub],
});
const tag = (t: IndustryTag) => t;

async function main() {
    const store = new InMemoryThreadIndexStore();

    // ── 1주차: t_hbm(2일·2출처, 과거 없음) + t_single(단일일) ──
    const w1Items = [
        item('i1', '2026-07-06', 'reuters.com'),
        item('i2', '2026-07-08', 'bloomberg.com'),
        item('i3', '2026-07-06', 'reuters.com'),
    ];
    const w1Clusters: ClusterAssignment[] = [
        { threadKey: 't_hbm', label: 'HBM', matchedExisting: false, participants: [], members: [{ itemId: 'i1', industryTags: [tag('semiconductor')] }, { itemId: 'i2', industryTags: [tag('ai_software')] }] },
        { threadKey: 't_single', label: '단독', matchedExisting: false, participants: [], members: [{ itemId: 'i3', industryTags: [tag('energy_utilities')] }] },
    ];
    const w1 = await runDeterministicPasses({
        dates: [], domain: 'ai', asOf: '2026-07-08', isoWeek: isoWeekKey('2026-07-08'),
        store, persist: true, items: w1Items, clusterFn: async () => w1Clusters,
    });

    chk('W1: t_hbm 하드게이트 통과하나 과거없어 grade=demoted(승격X)',
        w1.promoted.length === 0 && w1.graded.find(g => g.threadKey === 't_hbm')?.grade === 'demoted');
    chk('W1: t_hbm 강등사유 no_prior_evidence',
        w1.demoted.find(d => d.threadKey === 't_hbm')?.reason === 'no_prior_evidence');
    chk('W1: t_single 강등사유 single_date',
        w1.demoted.find(d => d.threadKey === 't_single')?.reason === 'single_date');
    chk('W1: 승격 0건', w1.promoted.length === 0);

    // ── 2주차: t_hbm 재관측(matched) → priorWeeksInternal=1 → M1 → grade B 승격 ──
    const w2Items = [
        item('j1', '2026-07-13', 'reuters.com'),
        item('j2', '2026-07-15', 'bloomberg.com'),
    ];
    const w2Clusters: ClusterAssignment[] = [
        { threadKey: 't_hbm', label: 'HBM', matchedExisting: true, participants: [], members: [{ itemId: 'j1', industryTags: [tag('semiconductor')] }, { itemId: 'j2', industryTags: [tag('ai_software')] }] },
    ];
    const w2 = await runDeterministicPasses({
        dates: [], domain: 'ai', asOf: '2026-07-15', isoWeek: isoWeekKey('2026-07-15'),
        store, persist: true, items: w2Items, clusterFn: async () => w2Clusters,
    });

    const hbm2 = w2.promoted.find(g => g.threadKey === 't_hbm');
    chk('W2: t_hbm 재관측 matched', w2.graded.find(g => g.threadKey === 't_hbm')?.matchedExisting === true);
    chk('W2: priorWeeksInternal=1', hbm2?.gate.priorWeeksInternal === 1, `got ${hbm2?.gate.priorWeeksInternal}`);
    chk('W2: M1 후보 확정', hbm2?.motionTypes.includes('M1') === true);
    chk('W2: grade=B 승격(형성중)', hbm2?.grade === 'B', hbm2?.grade);
    chk('W2: 승격 1건', w2.promoted.length === 1);

    // ── 빈 코퍼스 안전 ──
    const empty = await runDeterministicPasses({ dates: [], domain: 'ai', asOf: '2026-07-15', isoWeek: '2026-W29', store, persist: false, items: [], clusterFn: async () => [] });
    chk('빈 코퍼스: itemCount=0, 승격/강등 없음', empty.itemCount === 0 && empty.promoted.length === 0 && empty.demoted.length === 0);

    console.log(`\n${fail === 0 ? '✅' : '❌'} weekly-pipeline: ${pass} passed, ${fail} failed`);
    if (fail > 0) process.exit(1);
}
main();
