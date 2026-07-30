/**
 * internal_vocab_exposed **실행 경로** 발동 확인 (위반 산출물 강제 주입).
 * 단위검사(위반 판정)와 별개로, 재생성 1회 → 재실패 시 강등이 실제로 일어나는지 검증한다.
 */
import { generateWeeklyReportContent, type WeeklyThreadContent, type BuildThreadContentFn } from '../weekly/report-gen';
import type { DeterministicWeekResult, GradedThread } from '../weekly/pipeline';
import type { JudgmentProvider } from '../weekly/judgment';

let pass = 0, fail = 0;
const chk = (n: string, c: boolean, d?: string) => { if (c) { pass++; console.log(`[PASS] ${n}`); } else { fail++; console.log(`[FAIL] ${n}${d ? ' — ' + d : ''}`); } };

const LEAK = '만약 M1 유형의 초기 시그널처럼 확산되면 시장 구도가 재편된다. ';
const A = '정량 지표와 비교 서술 내용. ', B = '과거 관측 근거 서술. ';
const CLEAN = '만약 지속 관측된 흐름이 확대되면 시장 구도가 재편되므로 경영진은 조달 이원화 예산 배정을 결정해야 한다. ';
// 길이 DoD(본문 1100~1500 / 시사점 300~450 / 비율 20~25% / 헤더 3, 깊이 2) 충족 픽스처
const BG = B.repeat(14);
const MC = '## 지표 비교\n' + A.repeat(32) + '\n\n## 확산 양상\n' + A.repeat(32) + '\n\n## 전망\n' + A.repeat(32);
const IMPL_CLEAN = CLEAN.repeat(7);                     // 315자
const IMPL_LEAK = LEAK + CLEAN.repeat(6) + '추가 관측이 필요하다. '; // 위반 + 길이 DoD 충족(분량은 정상)

function content(over: Partial<WeeklyThreadContent> = {}): WeeklyThreadContent {
    return {
        threadKey: 't1', label: '라벨', grade: 'B', motionTypes: ['M1'],
        observedDates: ['2026-07-29', '2026-07-30'], priorWeeksInternal: 1,
        background: BG, mainContent: MC, implications: IMPL_CLEAN,
        killTrigger: '2026-09-30까지 시장조사기관 SNE리서치 발표 기준 점유율 30% 이하로 확인되면 이 판단을 철회한다',
        nextWeekCheck: '8월 12일 실적 발표',
        table: { title: 't', headers: ['구분', '전년', '금년'], rows: [['a', '1', '2'], ['b', '3', '4']] },
        metricsUsed: ['40.2%', '129 GWh', '5,000억 엔'],
        anchorSourceIds: ['reuters.com', 'bloomberg.com'], ...over,
    };
}
const thread = { threadKey: 't1', label: '라벨', participants: ['CATL'], matchedExisting: true,
    members: [{ itemId: 'i1', industryTags: [] }], grade: 'B',
    gate: { observedDates: ['2026-07-29', '2026-07-30'], priorWeeksInternal: 1, publishers: ['reuters.com', 'bloomberg.com'] },
    motionTypes: ['M1'], priorEvidence: [{ source: 'internal', observedAt: '2026-W30', legacy: false }],
} as unknown as GradedThread;
const result = { isoWeek: '2026-W31', domain: 'battery', itemCount: 1, graded: [thread], promoted: [thread], demoted: [] } as unknown as DeterministicWeekResult;
const provider = { generate: async () => ({ implications: CLEAN, killTrigger: 'k', nextWeekCheck: 'n' }) } as unknown as JudgmentProvider;

async function main() {
    // (1) 1회차 위반 → 재생성 후 정상 → 승격 유지
    let calls = 0;
    const healFn: BuildThreadContentFn = async () => { calls++; return content(calls === 1 ? { implications: IMPL_LEAK } : {}); };
    const healed = await generateWeeklyReportContent(result, [], { buildFn: healFn, provider });
    chk('(1) 위반 1회차 → 재생성 발동(빌드 2회 호출)', calls === 2, `calls=${calls}`);
    chk('(1) 재생성 후 정상 → 승격 유지', healed.threads.length === 1 && healed.demoted.length === 0);
    chk('(1) trace 0회차에 internal_vocab_exposed 기록',
        (healed.attemptTraces['t1'] ?? []).some(t => t.attempt === 0 && t.hardFailures.includes('internal_vocab_exposed')),
        JSON.stringify(healed.attemptTraces['t1']));

    // (2) 계속 위반 → 재실패 시 강등
    let calls2 = 0;
    const leakFn: BuildThreadContentFn = async () => { calls2++; return content({ implications: IMPL_LEAK }); };
    const demoted = await generateWeeklyReportContent(result, [], { buildFn: leakFn, provider });
    chk('(2) 재생성 후에도 위반 → 강등', demoted.threads.length === 0 && demoted.demoted.length === 1);
    chk('(2) 강등 사유 dod_failed', demoted.demoted[0]?.reason === 'dod_failed');
    chk('(2) 재생성 1회 시도 후 종료(빌드 2회)', calls2 === 2, `calls=${calls2}`);
    const leakTrace = demoted.attemptTraces['t1'] ?? [];
    chk('(2) trace 두 시도 모두 위반 기록',
        leakTrace.filter(t => t.hardFailures.includes('internal_vocab_exposed')).length === 2,
        JSON.stringify(leakTrace));

    console.log(`\n${fail === 0 ? '✅' : '❌'} weekly-vocab-enforcement: ${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
}
main();
