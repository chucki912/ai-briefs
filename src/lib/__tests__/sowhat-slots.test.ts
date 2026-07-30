/**
 * So What 슬롯 결함 수정 검증 (조사 실측 기반).
 *  · costIfWrong이 actionType 무관 상위 필드로 승격 → observe에서도 도달 가능
 *  · bet에 observe.metric 복사 금지(c20) — 채워진 듯 보이는 은폐 차단
 *  · 빈 슬롯 허용 + 렌더 생략(라벨만 남기지 않음)
 */
import { c20_betNotMetric, c10_actComplete, c21_costMagnitudeGrounded } from '../analyzers/structured-checks';
import { aggregateSoWhatSlots } from '../analyzers/sowhat-metrics';
import { buildReport } from '../generators/report-builder';
import type { IssueItem, SoWhatV2 } from '@/types';

let pass = 0, fail = 0;
const chk = (n: string, c: boolean, d?: string) => { if (c) { pass++; console.log(`[PASS] ${n}`); } else { fail++; console.log(`[FAIL] ${n}${d ? ' — ' + d : ''}`); } };

const METRIC = '주요 개발사의 API 기능 업데이트 건수';
const observeV2 = (over: Partial<SoWhatV2> = {}): SoWhatV2 => ({
    ifInferenceHolds: 'x', unknown: 'y', actionType: 'observe',
    observe: { metric: METRIC, cadence: '매월' }, killTrigger: '2026-12-31까지 30% 이하', ...over,
});
const card = (sw: SoWhatV2, legacy: { bet: string; downside: string }): IssueItem => ({
    headline: 'h', keyFacts: [], insight: 'i', framework: 'none', sources: [],
    soWhatV2: sw, soWhat: { ifTrue: 'a', uncertain: 'b', ...legacy },
} as IssueItem);

// ── (a) costIfWrong 상위 승격: observe에서도 도달 ──────────────────────────
const withCost = observeV2({ costIfWrong: '관측만 지속하다 대응이 한 분기 늦어지는 기회손실 — 되돌릴 수 있으나 선점 효과는 회수 불가' });
chk('(a) observe인데 costIfWrong 존재 가능', !!withCost.costIfWrong);
chk('(a) 집계: observe 카드의 costIfWrong 채움 계상',
    aggregateSoWhatSlots([card(withCost, { bet: '', downside: withCost.costIfWrong! })]).costIfWrongFilled === 1);
chk('(a) 집계: 빈 costIfWrong은 empty 계상(위반 아님)',
    aggregateSoWhatSlots([card(observeV2(), { bet: '', downside: '' })]).costIfWrongEmpty === 1);

// ── (d) bet ≠ observe.metric ────────────────────────────────────────────────
chk('(d) c20: bet에 metric 복사 → 위반 적발',
    c20_betNotMetric(card(observeV2(), { bet: METRIC, downside: '' })).some(i => i.code === 'c20_bet_equals_metric'));
chk('(d) c20: bet 빈 값(관측만) → 위반 아님',
    c20_betNotMetric(card(observeV2(), { bet: '', downside: '' })).length === 0);
chk('(d) c20: bet이 실제 행동 문장 → 위반 아님',
    c20_betNotMetric(card(observeV2(), { bet: '공급사 이원화 계약 검토 착수', downside: '' })).length === 0);
chk('(d) 집계: betEqualsMetric 카운트',
    aggregateSoWhatSlots([card(observeV2(), { bet: METRIC, downside: '' })]).betEqualsMetric === 1);

// ── C10: costIfWrong은 이제 act에서도 필수 아님(빈 값 허용) ────────────────
chk('C10: act + costIfMissed 있으면 costIfWrong 없어도 통과',
    c10_actComplete({ ifInferenceHolds: 'x', unknown: 'y', actionType: 'act', killTrigger: 'k',
        action: { what: 'do', reversible: true, costIfMissed: '놓쳤을 때' } } as SoWhatV2).length === 0);
chk('C10: act인데 costIfMissed 없으면 여전히 위반',
    c10_actComplete({ ifInferenceHolds: 'x', unknown: 'y', actionType: 'act', killTrigger: 'k',
        action: { what: 'do', reversible: true, costIfMissed: '' } } as SoWhatV2).length === 1);

// ── (b) 빈 슬롯 렌더 생략 ───────────────────────────────────────────────────
const mdEmpty = buildReport([card(observeV2(), { bet: '', downside: '' })], new Date('2026-07-30T00:00:00')).markdown;
chk('(b) 빈 bet/downside는 마크다운에서 줄 생략', !mdEmpty.includes('베팅:') && !mdEmpty.includes('틀렸을 때:'), mdEmpty.split('So What')[1]?.slice(0, 60));
chk('(b) 채워진 슬롯은 정상 출력', mdEmpty.includes('사실이라면:') && mdEmpty.includes('불확실:'));
const mdFilled = buildReport([card(withCost, { bet: '공급사 이원화 검토', downside: withCost.costIfWrong! })], new Date('2026-07-30T00:00:00')).markdown;
chk('(b) 채워지면 틀렸을 때 줄 출력', mdFilled.includes('틀렸을 때: 관측만 지속하다'));
chk('(b) 더 이상 "—" 대체 없음', !mdFilled.includes('틀렸을 때: —') && !mdEmpty.includes('—'));

// ── c21: costIfWrong 규모의 근거(전방검증 경계사례 기반) ───────────────────
const cardWithFacts = (cost: string, facts: string[]): IssueItem => ({
    headline: 'h', keyFacts: facts, insight: 'i', framework: 'none', sources: [],
    soWhatV2: observeV2({ costIfWrong: cost }), soWhat: { ifTrue: 'a', uncertain: 'b', bet: '', downside: cost },
} as IssueItem);
// 실제 불합격 사례(전방검증 ai-run3): 카드 사실에 금액 근거 없음
chk('c21: 근거 없는 "수십억 달러" 규모 → 위반',
    c21_costMagnitudeGrounded(cardWithFacts('회복 불가능한 수십억 달러 규모에 달할 것입니다',
        ['마이크로소프트가 사이버 보안 AI 모델을 공개함'])).some(i => i.code === 'c21_cost_magnitude_ungrounded'));
chk('c21: 정성적 기술("회복 불가능한 수준") → 통과',
    c21_costMagnitudeGrounded(cardWithFacts('회복 불가능한 수준의 시장 지위 상실이며 되돌릴 수 없습니다',
        ['마이크로소프트가 사이버 보안 AI 모델을 공개함'])).length === 0);
chk('c21: 카드 사실에 금액 근거가 있으면 모호 규모어 허용',
    c21_costMagnitudeGrounded(cardWithFacts('수십억 달러 규모의 손실',
        ['메타는 140억 달러 규모 데이터센터 투자를 발표함'])).length === 0);
chk('c21: 숫자 규모가 keyFacts에 존재하면 통과',
    c21_costMagnitudeGrounded(cardWithFacts('투자한 140억 달러의 회수가 지연된다',
        ['메타는 140억 달러 규모 데이터센터 투자를 발표함'])).length === 0);
chk('c21: 숫자 규모가 keyFacts에 없으면 위반',
    c21_costMagnitudeGrounded(cardWithFacts('약 30% 매출 감소가 발생한다',
        ['메타는 데이터센터 투자를 발표함'])).some(i => i.code === 'c21_cost_magnitude_ungrounded'));
chk('c21: 빈 costIfWrong은 검사 대상 아님', c21_costMagnitudeGrounded(cardWithFacts('', ['x'])).length === 0);
chk('c21 severity=warning(카드 폐기 아님)',
    c21_costMagnitudeGrounded(cardWithFacts('수십억 달러', ['x']))[0]?.severity === 'warning');

console.log(`\n${fail === 0 ? '✅' : '❌'} sowhat-slots: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
