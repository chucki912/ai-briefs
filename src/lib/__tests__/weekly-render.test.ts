/** T7 렌더러 테스트 (외부 API 불필요).
 *  npx tsx src/lib/__tests__/weekly-render.test.ts */
import { renderWeeklyReport } from '../weekly/render';
import type { WeeklyReportContent, WeeklyThreadContent } from '../weekly/report-gen';
import type { DemotedThread } from '../weekly/pipeline';
import { DEMOTED_FORBIDDEN } from '../../configs/weekly-house-style';

let pass = 0, fail = 0;
const chk = (name: string, cond: boolean, d?: string) => {
    if (cond) { pass++; console.log(`[PASS] ${name}`); }
    else { fail++; console.log(`[FAIL] ${name}${d ? ' — ' + d : ''}`); }
};

const thread = (over: Partial<WeeklyThreadContent> = {}): WeeklyThreadContent => ({
    threadKey: 't1', label: 'CATL 나트륨이온', grade: 'A', motionTypes: ['M1', 'M4'],
    observedDates: ['2026-07-20', '2026-07-22'], priorWeeksInternal: 6,
    background: '배경', mainContent: '주요 내용', implications: '시사점',
    killTrigger: '2026-W34까지 X 발생 시 철회, 규제TF 관측', nextWeekCheck: '2026-W31 어닝콜',
    table: { title: '비교', headers: ['구분', '전년', '금년'], rows: [['매출', '100', '130']] },
    metricsUsed: ['월 14만장', '30%'], anchorSourceIds: ['reuters.com'], ...over,
});
const demoted = (label: string, reason: DemotedThread['reason']): DemotedThread => ({ threadKey: label, label, reason, memberCount: 1 });

const base = (over: Partial<WeeklyReportContent> = {}): WeeklyReportContent => ({
    isoWeek: '2026-W30', domain: 'battery', threads: [], demoted: [], promotedCount: 0, attemptTraces: {}, ...over,
});

// ── 0건 처리 ─────────────────────────────────────────────────────────────────
const zero = renderWeeklyReport(base({ demoted: [demoted('X', 'single_date')] }));
chk('0건: 결론문(방법론 금지)', zero.includes('지속적 흐름으로 볼 만한 움직임은 관측되지 않음'));
chk('0건: 섹션1 고정출력 + 빈 결과 1줄', zero.includes('## 1. 트렌드') && zero.includes('이번 주 확립된 트렌드 없음'));
chk('0건: 섹션3 고정출력 + 빈 결과 1줄', zero.includes('## 3. 다음 주 확인 포인트') && zero.includes('이번 주 검증 대상 없음'));
chk('0건: 내부어휘 미노출', !zero.includes('승격') && !zero.includes('스레드가') && !zero.includes('게이트'));
chk('0건: demoted 섹션 건수 표기', zero.includes('트렌드 미성립 (1건)'));

// ── N<3 헤드라인 ─────────────────────────────────────────────────────────────
const two = renderWeeklyReport(base({ threads: [thread({ threadKey: 'a', label: 'A스레드' }), thread({ threadKey: 'b', label: 'B스레드', grade: 'B' })], promotedCount: 2 }));
chk('N<3: 건수 명시(독자 용어)', two.includes('확립·형성 중 흐름 2건'));
chk('헤드라인: 등급명칭(번역)+수치', two.includes('[확립] A스레드 — 월 14만장'));

// ── 정형 3단 + 표 ────────────────────────────────────────────────────────────
const full = renderWeeklyReport(base({ threads: [thread()], promotedCount: 1 }));
chk('정형 3단 라벨', full.includes('[배경]') && full.includes('[주요 내용]') && full.includes('[시사점]'));
chk('표 렌더', full.includes('| 구분 | 전년 | 금년 |'));
chk('다음 주 확인 + 확인시점(내부어휘 금지)', full.includes('## 3. 다음 주 확인') && full.includes('확인 시점:') && !full.includes('킬 트리거'));

// ── showDemoted 모드 ─────────────────────────────────────────────────────────
const withDemoted = base({ threads: [thread()], promotedCount: 1, demoted: [demoted('강등1', 'single_date'), demoted('강등2', 'dod_failed')] });
chk('titles(기본): 제목+태그', renderWeeklyReport(withDemoted).includes('- 강등1 — [단일일 관측]'));
chk('titles: 건수 2건', renderWeeklyReport(withDemoted).includes('트렌드 미성립 (2건)'));
chk('full: 관측 항목 수 포함', renderWeeklyReport(withDemoted, { showDemoted: 'full' }).includes('관측 항목'));
chk('off: demoted 섹션 없음', !renderWeeklyReport(withDemoted, { showDemoted: 'off' }).includes('트렌드 미성립'));
chk('dod_failed → 독자 태그', renderWeeklyReport(withDemoted).includes('[관측 근거 불충분]'));
chk('단발관측 섹션 성격 설명 1줄', renderWeeklyReport(withDemoted).includes('지속성 판단이 불가한 항목'));

// ── 리터럴 개행 정규화(렌더 깨짐 방어) ──────────────────────────────────────
const escaped = renderWeeklyReport(base({ threads: [thread({ mainContent: '첫째 줄\\n\\n둘째 줄' })], promotedCount: 1 }));
chk('리터럴 \\n 정규화(백슬래시-n 미잔존)', !escaped.includes('\\n'));

// ── 헤드라인 수치 줄 간 중복 회피 ────────────────────────────────────────────
const dupMetric = renderWeeklyReport(base({
    threads: [thread({ threadKey: 'a', label: 'A', metricsUsed: ['90%', '30년'] }), thread({ threadKey: 'b', label: 'B', grade: 'B', metricsUsed: ['90%', '557,090대'] })],
    promotedCount: 2,
}));
chk('헤드라인: 같은 수치 반복 안 함', dupMetric.includes('[확립] A — 90%') && dupMetric.includes('[형성 중] B — 557,090대'), dupMetric.split('## 1.')[0]);

// ── DoD12: demoted 건수 == 실제 강등 수 ─────────────────────────────────────
const md = renderWeeklyReport(withDemoted);
chk('DoD12: 건수 표기 == 실제', md.includes(`(${withDemoted.demoted.length}건)`));

// ── demoted 항목 서술 금지어 부재(헤더 지정명 제외, 항목 라인만) ────────────
const demotedItemLines = (renderWeeklyReport(base({ demoted: [demoted('테스트 항목', 'single_date')] })).split('## 4.')[1] ?? '')
    .split('\n').filter(l => l.trim().startsWith('- ')).join('\n');
chk('demoted 항목 서술 금지어(트렌드/흐름/추세/조짐) 없음', DEMOTED_FORBIDDEN.every(w => !demotedItemLines.includes(w)), demotedItemLines);

console.log(`\n${fail === 0 ? '✅' : '❌'} weekly-render: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
