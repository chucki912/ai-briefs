/** PASS 7 DoD 검증기 테스트 (외부 API 불필요).
 *  npx tsx src/lib/__tests__/weekly-validate.test.ts */
import {
    validateWeeklyThread, charLen, eightGramOverlap, headerStats, classifyParagraphs, hasHardFailure,
} from '../weekly/validate-weekly';
import type { WeeklyThreadContent } from '../weekly/report-gen';

let pass = 0, fail = 0;
const chk = (name: string, cond: boolean, d?: string) => {
    if (cond) { pass++; console.log(`[PASS] ${name}`); }
    else { fail++; console.log(`[FAIL] ${name}${d ? ' — ' + d : ''}`); }
};
const has = (fails: { rule: string }[], rule: string) => fails.some(f => f.rule === rule);

// ── 유닛 헬퍼 ────────────────────────────────────────────────────────────────
chk('charLen: 공백 제외', charLen('가 나 다\n라') === 4);
chk('headerStats: 카운트/깊이', (() => { const h = headerStats('## A\n본문\n### B'); return h.count === 2 && h.maxDepth === 3; })());
chk('eightGram: 동일 8단어 검출', eightGramOverlap('w1 w2 w3 w4 w5 w6 w7 w8', 'x w1 w2 w3 w4 w5 w6 w7 w8 y') === 1);
chk('eightGram: 7단어면 미검출', eightGramOverlap('w1 w2 w3 w4 w5 w6 w7', 'w1 w2 w3 w4 w5 w6 w7') === 0);
chk('classify: 단순서술 카운트', classifyParagraphs('사건이 있었다.\n\n전년 대비 30% 증가했다.\n\n향후 확대될 전망이다.').b9plain === 1);

// ── 유효 콘텐츠(hard 위반 0) ─────────────────────────────────────────────────
const bg = '과거 여섯 주간 지속 관측된 사안으로, 초기 대비 규모가 꾸준히 확대되어 왔다. 선행 국면에서는 제한적 신호였으나 이번 주 들어 정량 지표가 임계를 넘어섰다. 배경상 구조적 변화의 초입에 위치한다고 볼 근거가 축적되었다.';
const prose = [
    '이번 주 매출은 전년 대비 삼십 퍼센트 증가한 반면 경쟁사는 오 퍼센트 감소하며 격차가 크게 벌어졌다.',
    '정량 지표로 보면 점유율은 전월 이십 퍼센트에서 이십팔 퍼센트로 상승했고 이는 구조적 우위를 시사한다.',
    '원가 측면에서 톤당 단가는 전년 대비 십오 퍼센트 하락했으며 이 격차는 향후 확대될 전망이다.',
    '경쟁 진영은 증설 계획을 발표하며 대응에 나섰고 내년 상반기 양산이 예상되어 판도 변화가 전개될 것으로 보인다.',
    '해석하면 이 지표들은 단순 일회성이 아니라 누적된 방향성을 가리키며 본질적으로 국면 전환을 의미한다.',
].join('\n\n');
// 길이 규격(1100~1500자) 충족을 위해 헤더 3개 사이에 검증된 문단 블록을 반복 배치
const para = ['## 관측 사실', prose, '## 정량 근거', prose, prose, '## 비교', prose, prose, prose].join('\n\n');
const validContent: WeeklyThreadContent = {
    threadKey: 't', label: 'L', grade: 'A', motionTypes: ['M1', 'M2'],
    observedDates: ['2026-07-13', '2026-07-15'], priorWeeksInternal: 6,
    background: bg,
    mainContent: para,
    implications: '만약 이 원가 우위가 지속되면 경쟁 구도는 근본적으로 재편되고, 경영진은 즉각 생산 능력 확대와 장기 조달 계약 체결을 결정해야 한다. 특히 저가 물량을 앞세운 침투가 인접 시장으로 번질 경우 방어보다 선제적 증설이 유리한 국면으로 바뀐다. 다만 원자재 가격이 반등하거나 경쟁사가 공정 혁신에 성공하면 이 판단은 뒤집힐 수 있으므로, 조달 계약 구조와 재고 정책을 분기 단위로 병행 점검해야 하는 국면으로 전개된다. 하반기 증설 의사결정에 이 판단을 직접 반영하되 반증 지표를 함께 추적하며, 필요 시 결정을 유보하는 조건도 사전에 규정한다. 아울러 조달과 판매 양쪽에서 헤지 수단을 마련해 두어 어느 방향으로 국면이 전개되더라도 손실을 제한할 수 있도록 대비 태세를 갖추고 분기마다 시나리오를 재점검해 대응 원칙을 갱신한다.',
    killTrigger: '만약 경쟁사가 2026-W34까지 동등 원가를 달성했다고 공식 발표하면 이 판단을 철회한다. 전략기획팀이 분기 공시로 관측한다.',
    nextWeekCheck: '2026-W31 경쟁사 어닝콜에서 원가 구조 공개 여부 확인',
    table: { title: '비교', headers: ['구분', '전년', '금년'], rows: [['매출', '100', '130'], ['점유율', '20%', '28%']] },
    metricsUsed: ['30%', '6주', '15%', '28%'], anchorSourceIds: ['reuters.com'],
};
const vf = validateWeeklyThread(validContent);
chk('유효 콘텐츠: hard 위반 없음', !hasHardFailure(vf), JSON.stringify(vf.filter(f => f.severity === 'hard')));

// ── 위반 케이스 ──────────────────────────────────────────────────────────────
chk('본문 초과 → body_length', has(validateWeeklyThread({ ...validContent, mainContent: '짧음' }), 'body_length'));
chk('시사점 비율 위반', has(validateWeeklyThread({ ...validContent, implications: '짧은 시사점.' }), 'implication_length'));
chk('표 부족 → comparison_table', has(validateWeeklyThread({ ...validContent, table: { title: 'x', headers: ['a'], rows: [['1']] } }), 'comparison_table'));
chk('수치 부족 → distinct_metrics', has(validateWeeklyThread({ ...validContent, background: '숫자 없는 배경 단락이다.', mainContent: '숫자 없는 본문 단락이다. '.repeat(60), metricsUsed: [] }), 'distinct_metrics'));
chk('금지 어미 → implication_forbidden_ending', has(validateWeeklyThread({ ...validContent, implications: '이 사안은 매우 중요하다. 지속적인 관심이 필요하다' }), 'implication_forbidden_ending'));
chk('킬트리거 날짜 없음', has(validateWeeklyThread({ ...validContent, killTrigger: '경쟁사가 원가를 달성하면 철회한다. 전략기획팀 관측.' }), 'kill_trigger_date'));
chk('단일일 과대주장어 → overclaim_forbidden', has(validateWeeklyThread({ ...validContent, observedDates: ['2026-07-13'], mainContent: validContent.mainContent + ' 본격화 국면이다.' }), 'overclaim_forbidden'));
chk('8-gram 재요약 → implication_body_overlap', (() => {
    const shared = '완전히 동일한 여덟 개 이상의 단어 구절을 그대로 재사용';
    return has(validateWeeklyThread({ ...validContent, mainContent: validContent.mainContent + '\n\n' + shared, implications: `앞부분 ${shared} 뒷부분으로 재요약함.` }), 'implication_body_overlap');
})());
chk('C등급 단정 → c_grade_assertion', has(validateWeeklyThread({ ...validContent, grade: 'C', implications: '이 사안은 분명하다. 우리는 즉각 대응 방향을 조정한다. 다만 틀릴 수 있는 지점은 존재하는 국면이다.' }), 'c_grade_assertion'));

console.log(`\n${fail === 0 ? '✅' : '❌'} weekly-validate: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
