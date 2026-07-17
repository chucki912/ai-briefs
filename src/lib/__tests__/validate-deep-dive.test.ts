/** 내용 게이트(validateDeepDiveContent) 단위 테스트 (외부 API 불필요).
 *  npx tsx src/lib/__tests__/validate-deep-dive.test.ts */
import { validateDeepDiveContent } from '../validate-deep-dive';
import { buildPass1ContentFeedback } from '../deep-dive-schema';
import { CONTENT_GATE_CONFIG } from '../validation-config';
import type { DeepDiveStructured, DeepDiveWatchItem } from '../../types';

let pass = 0, fail = 0;
const chk = (name: string, cond: boolean, d?: string) => { if (cond) { pass++; console.log(`[PASS] ${name}`); } else { fail++; console.log(`[FAIL] ${name}${d ? ' — ' + d : ''}`); } };

// 완전한 fixture (config 임계값에서 개수 역산 — 하드코딩 금지)
const watchItem = (n: number): DeepDiveWatchItem => ({
    indicator: `지표 ${n}`, why: '선행 신호임', threshold: `YoY 30% 미만 시 피보팅`,
    killTrigger: `2026년 12월 31일까지 3개 도달 시 폐기`, dataSource: '분기 어닝콜',
});
const dev = (n: number) => ({
    heading: `사건 ${n}`,
    facts: [{ text: `사실 ${n} (Reuters, 2026-07)`, sourceIds: ['s1'], publishedAt: '2026-07-01' }],
    analysis: ['메커니즘 인과 분석'],
});
const complete: DeepDiveStructured = {
    reportType: 'deep_dive',
    title: '테스트 리포트',
    meta: { analysisTarget: 'HBM', audience: 'CTO', horizon: '2026-07 기준 6~12개월', perspective: 'Market' },
    background: { whyNow: '지금인 이유', trajectory: '2023→2026 궤적' },
    signal: '선주문 2배 (TrendForce, 2026-06)',
    // anchor.sourceIds: 갱신 사유 — anchor 결박 스키마 추가(출처 티어링 태스크)
    anchor: { metric: '웨이퍼 캐파', value: '월 14만장 (TrendForce, 2026-06)', source: 'TrendForce', asOf: '2026-06', flipThreshold: '월 20만장 초과 시 반전', sourceIds: ['s1'] },
    keyDevelopments: Array.from({ length: CONTENT_GATE_CONFIG.MIN_KEY_DEVELOPMENTS }, (_, i) => dev(i + 1)),
    secondOrderMap: { primaryShift: '배분 권력화', upstream: 'TSV 리드타임 연장', downstream: 'BOM 상승', adjacent: '전력 반도체 수혜' },
    soWhat: {
        ifInferenceHolds: 'HBM이 GPU 로드맵을 역규정', unknown: '삼성 인증 시점',
        actionType: 'act',
        action: { what: '비중 확대', reversible: true, costIfWrong: '고점 매수 손실', costIfMissed: '랠리 소외' },
        killTrigger: '2026-12-31까지 인증 벤더 3개 이상이면 폐기',
    },
    risks: Array.from({ length: CONTENT_GATE_CONFIG.MIN_RISKS }, (_, i) => (
        { domain: 'tech' as const, risk: `수율 리스크 ${i + 1}`, downsideCost: '캐파 20% 하향', mitigation: '분기 추적' }
    )),
    watchlist: Array.from({ length: CONTENT_GATE_CONFIG.MIN_WATCHLIST_ITEMS }, (_, i) => watchItem(i + 1)),
    sourceRefs: [
        { id: 's1', url: 'https://reuters.com/a', resolved: true, tier: 'unknown' },
        { id: 's2', url: 'https://www.tradethepool.com/x', resolved: true, tier: 'aggregator' },
    ],
};
const clone = (): DeepDiveStructured => JSON.parse(JSON.stringify(complete));

// 1. 완전한 fixture → pass
{
    const r = validateDeepDiveContent(complete, CONTENT_GATE_CONFIG);
    chk('완전한 fixture → pass', r.pass && r.failures.length === 0, JSON.stringify(r.failures));
}

// 2. costIfWrong 빈 문자열 + actionType 'act' → fail (path 정확성)
{
    const s = clone();
    s.soWhat.action!.costIfWrong = '';
    const r = validateDeepDiveContent(s, CONTENT_GATE_CONFIG);
    chk("act + costIfWrong='' → fail, path 정확", !r.pass && r.failures.some(f => f.path === 'soWhat.action.costIfWrong' && f.rule === 'non_empty'), JSON.stringify(r.failures));
}

// 3. actionType 'none' + action 부재 → pass (none 합법)
{
    const s = clone();
    s.soWhat.actionType = 'none';
    delete s.soWhat.action;
    const r = validateDeepDiveContent(s, CONTENT_GATE_CONFIG);
    chk("none + action 부재 → pass", r.pass, JSON.stringify(r.failures));
}

// 4. killTrigger에 숫자·날짜 없음 → fail
{
    const s = clone();
    s.soWhat.killTrigger = '사용률이 낮아지면';
    const r = validateDeepDiveContent(s, CONTENT_GATE_CONFIG);
    chk('killTrigger 숫자·날짜 없음 → fail', !r.pass && r.failures.some(f => f.path === 'soWhat.killTrigger' && f.rule === 'needs_number_or_date'), JSON.stringify(r.failures));
}

// 5. watchlist 최소 미달 → fail (min_items)
{
    const s = clone();
    s.watchlist = s.watchlist.slice(0, CONTENT_GATE_CONFIG.MIN_WATCHLIST_ITEMS - 1);
    const r = validateDeepDiveContent(s, CONTENT_GATE_CONFIG);
    chk('watchlist 최소 미달 → fail(min_items)', !r.pass && r.failures.some(f => f.path === 'watchlist' && f.rule === 'min_items'), JSON.stringify(r.failures));
}

// 6. fact의 sourceIds에 sourceRefs 밖 id → fail (source_binding)
{
    const s = clone();
    s.keyDevelopments[0].facts[0].sourceIds = ['s1', 'x9'];
    const r = validateDeepDiveContent(s, CONTENT_GATE_CONFIG);
    chk('sourceRefs 밖 id 참조 → fail(source_binding)', !r.pass && r.failures.some(f => f.path === 'keyDevelopments[0].facts[0].sourceIds' && f.rule === 'source_binding'), JSON.stringify(r.failures));
}

// 7. 공백만 있는 문자열 → non_empty 실패
{
    const s = clone();
    s.signal = '   ';
    const r = validateDeepDiveContent(s, CONTENT_GATE_CONFIG);
    chk("공백만('   ') → non_empty 실패", !r.pass && r.failures.some(f => f.path === 'signal' && f.rule === 'non_empty'), JSON.stringify(r.failures));
}

// 8. 복수 실패 전부 수집 (첫 실패 중단 금지)
{
    const s = clone();
    s.signal = '';
    s.anchor.flipThreshold = '수요가 꺾이면';
    s.watchlist[0].dataSource = ' ';
    s.keyDevelopments[1].facts[0].sourceIds = [];
    const r = validateDeepDiveContent(s, CONTENT_GATE_CONFIG);
    const paths = r.failures.map(f => f.path);
    chk('복수 실패 전부 수집', !r.pass
        && paths.includes('signal')
        && paths.includes('anchor.flipThreshold')
        && paths.includes('watchlist[0].dataSource')
        && paths.includes('keyDevelopments[1].facts[0].sourceIds')
        && r.failures.length >= 4, JSON.stringify(paths));
}

// ── 출처 티어링 규칙 (SOURCE_TIERING 전달 시) ──
import { SOURCE_TIERING } from '../validation-config';

// T1. anchor sourceIds가 sourceRefs 밖 id → anchor_source_binding 실패
{
    const s = clone();
    s.anchor.sourceIds = ['x9'];
    const r = validateDeepDiveContent(s, CONTENT_GATE_CONFIG, SOURCE_TIERING);
    chk('anchor 결박 밖 id → anchor_source_binding', !r.pass && r.failures.some(f => f.path === 'anchor.sourceIds' && f.rule === 'anchor_source_binding'), JSON.stringify(r.failures));
}

// T2. anchor가 denylist(aggregator) 출처에만 결박 → anchor_source_tier 실패
{
    const s = clone();
    s.anchor.sourceIds = ['s2']; // tier: 'aggregator'
    const r = validateDeepDiveContent(s, CONTENT_GATE_CONFIG, SOURCE_TIERING);
    chk('anchor 전부 애그리게이터 결박 → anchor_source_tier', !r.pass && r.failures.some(f => f.path === 'anchor.sourceIds' && f.rule === 'anchor_source_tier'), JSON.stringify(r.failures));
}

// T3. denylist 1개 + 비-denylist 1개 결박 → 통과
{
    const s = clone();
    s.anchor.sourceIds = ['s1', 's2'];
    const r = validateDeepDiveContent(s, CONTENT_GATE_CONFIG, SOURCE_TIERING);
    chk('애그리게이터+비애그리게이터 혼합 결박 → pass', r.pass, JSON.stringify(r.failures));
}

// T4. ENFORCE_ANCHOR_TIER=false → tier 검사 면제
{
    const s = clone();
    s.anchor.sourceIds = ['s2'];
    const r = validateDeepDiveContent(s, CONTENT_GATE_CONFIG, { ...SOURCE_TIERING, ENFORCE_ANCHOR_TIER: false });
    chk('ENFORCE_ANCHOR_TIER=false → tier 면제', r.pass, JSON.stringify(r.failures));
}

// 9. 복구 경로 모의 확인: 훼손 fixture의 실패 목록 → pass 1 재실행 피드백에 계약 항목이 재강조되는지
{
    const s = clone();
    s.soWhat.action!.costIfWrong = '';
    s.anchor.flipThreshold = '수요가 꺾이면';
    const r = validateDeepDiveContent(s, CONTENT_GATE_CONFIG);
    const fb = buildPass1ContentFeedback(r.failures);
    chk('pass1 피드백에 costIfWrong 계약 항목 재강조', fb.includes('costIfWrong') && fb.includes('베팅이 틀렸을 때'), fb);
    chk('pass1 피드백에 flipThreshold 계약 항목 재강조', fb.includes('flipThreshold') && fb.includes('임계치'), fb);
}

console.log(`\n내용 게이트 테스트: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
