/** Deep Dive 도메인 주입 단위 테스트 (외부 API 불필요). npx tsx src/lib/__tests__/deep-dive-domain.test.ts */
import { buildDeepDiveSystemPrompt, AI_DEEP_DIVE_DOMAIN, BATTERY_DEEP_DIVE_DOMAIN } from '../deep-dive-pipeline';

let pass = 0, fail = 0;
const chk = (name: string, cond: boolean, d?: string) => { if (cond) { pass++; console.log(`[PASS] ${name}`); } else { fail++; console.log(`[FAIL] ${name}${d ? ' — ' + d : ''}`); } };

const ai = buildDeepDiveSystemPrompt(AI_DEEP_DIVE_DOMAIN);
const battery = buildDeepDiveSystemPrompt(BATTERY_DEEP_DIVE_DOMAIN);

// reportType·키 체계
chk("AI config reportType='deep_dive'", AI_DEEP_DIVE_DOMAIN.reportType === 'deep_dive' && AI_DEEP_DIVE_DOMAIN.jobKeyPrefix === 'trend_job');
chk("battery config reportType='battery_deep_dive'", BATTERY_DEEP_DIVE_DOMAIN.reportType === 'battery_deep_dive' && BATTERY_DEEP_DIVE_DOMAIN.jobKeyPrefix === 'battery_trend_job');

// 배터리 검색 조향 문구 주입 (설계 원칙 3)
chk('battery: SNE·BNEF·BMI 조향 문구 포함', battery.includes('SNE Research') && battery.includes('BloombergNEF') && battery.includes('Benchmark Mineral Intelligence') && battery.includes('집계·리라이팅 사이트의 수치 금지'));
chk('battery: 배터리 Triple-Search(공급망/원가/정책)', battery.includes('[Supply Chain Analysis]') && battery.includes('[Cost Curve & CapEx]') && battery.includes('[Policy Moat]'));
chk('battery: 배터리 Reasoning Chain', battery.includes('Physics & Chemistry Limit') && battery.includes('Vertical Integration Efficiency'));

// AI판은 조향 블록 없음 + AI Triple-Search 유지 (동작 변경 0)
chk('AI: 배터리 조향 문구 미포함', !ai.includes('SNE Research') && !ai.includes('[Supply Chain Analysis]'));
chk('AI: 기존 Triple-Search 유지', ai.includes('[Primary Evidence]') && ai.includes('[Independent Triangulation]'));

// 도메인 무관 본문 공유 (v3 골격)
for (const [label, p] of [['AI', ai], ['battery', battery]] as const) {
    chk(`${label}: v3 골격(PRIME DIRECTIVE·Anti-Overclaim·계약 항목) 포함`,
        p.includes('PRIME DIRECTIVE') && p.includes('Anti-Overclaim Litmus') && p.includes('### 계약 항목 (전부 필수)') && p.includes('당사자 프레임 검증'));
}

// 구 Basis 부착 체계 소멸: 부착 지시('(Basis: <' 템플릿/Expert Analytical Basis) 미출현.
// (금지 문구 'Basis 꼬리표 금지'·'(Basis: 네트워크 효과)' 예시는 잔재가 아님 — 부착 지시만 검사)
chk('battery: Basis 부착 지시 소멸', !battery.includes('Expert Analytical Basis') && !battery.includes('(Basis: <'));

// attemptTrace — grounding 상태 판별 + 폐기 에러의 trace 운반 (진단 인프라)
{
    const { buildAttemptTraceEntry, DeepDiveDiscardError } = require('../deep-dive-pipeline');
    chk('trace: metadata 부재 → absent',
        buildAttemptTraceEntry(1, 1, null, 0, 82_300).grounding === 'absent');
    chk('trace: metadata 존재·청크 0 → zero',
        buildAttemptTraceEntry(1, 2, {}, 0, 60_000).grounding === 'zero');
    chk('trace: 청크 N → chunks=N',
        buildAttemptTraceEntry(2, 1, { groundingChunks: [] }, 12, 75_000).grounding === 'chunks=12');
    const e = buildAttemptTraceEntry(1, 1, null, 0, 82_349);
    chk('trace: elapsedSec 0.1초 단위 반올림', e.elapsedSec === 82.3 && e.cycle === 1 && e.attempt === 1);
    const err = new DeepDiveDiscardError('폐기', [e]);
    chk('DeepDiveDiscardError가 trace 운반', err.trace.length === 1 && err.trace[0].grounding === 'absent');
    chk('DeepDiveDiscardError trace 기본값 빈 배열', new DeepDiveDiscardError('폐기').trace.length === 0);
}

console.log(`\n도메인 주입 테스트: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
