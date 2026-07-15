/**
 * Key Insight 지표/임계값 단위 테스트 — 외부 API·Redis 불필요.
 *   실행: npx tsx scripts/test-key-insight-metrics.ts
 *
 * 주의: dotenv를 로드하지 않으므로 store는 로컬 파일 어댑터를 사용한다(프로덕션 Redis 미접촉).
 */
import {
    recordKeyInsightMetrics,
    getKeyInsightMetrics,
    evaluateKeyInsightThresholds,
    KeyInsightMetrics,
    DECISION_MIN_SAMPLE,
} from '../src/lib/analyzers/key-insight-metrics';
import { ValidatedKeyInsightResult, KeyInsightValidation } from '../src/lib/analyzers/key-insight';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail?: string) {
    if (cond) { pass++; console.log(`[PASS] ${name}`); }
    else { fail++; console.log(`[FAIL] ${name}${detail ? ` — ${detail}` : ''}`); }
}

// 검증 결과 목업 헬퍼
function val(errorCodes: string[] = [], warnCodes: string[] = []): KeyInsightValidation {
    const issues = [
        ...errorCodes.map(c => ({ code: c as any, severity: 'error' as const, message: c })),
        ...warnCodes.map(c => ({ code: c as any, severity: 'warning' as const, message: c })),
    ];
    return { ok: issues.length === 0, hasError: errorCodes.length > 0, sentenceCount: 3, issues, warnings: issues.map(i => i.message) };
}
function result(o: Partial<ValidatedKeyInsightResult> & { firstValidation: KeyInsightValidation; finalValidation: KeyInsightValidation }): ValidatedKeyInsightResult {
    return {
        insight: 'x', firstInsight: 'x', regenerated: false, chosen: 'first', apiCalls: 0, regenError: false,
        ...o,
    };
}

async function testRecording() {
    console.log('\n--- 지표 누적(로컬 파일 어댑터) ---');
    const base = (await getKeyInsightMetrics('ai')) ?? { total: 0, firstPassClean: 0, regenerated: 0, resolved: 0, unresolved: 0, regenError: 0, chosenRegen: 0, codeCounts: {} } as KeyInsightMetrics;

    // (1) 1차 통과
    await recordKeyInsightMetrics(result({ firstValidation: val(), finalValidation: val() }), 'ai', 1000);
    // (2) 재생성 해소: 1차 error(intent), 재생성 채택, 최종 clean
    await recordKeyInsightMetrics(result({ regenerated: true, chosen: 'regenerated', firstValidation: val(['intent_assertion']), finalValidation: val() }), 'ai', 1001);
    // (3) 재생성 미해소: 1차 error(missing_action), 최종 여전히 error
    await recordKeyInsightMetrics(result({ regenerated: true, chosen: 'first', firstValidation: val(['missing_action']), finalValidation: val(['missing_action']) }), 'ai', 1002);
    // (4) 재생성기 오류
    await recordKeyInsightMetrics(result({ regenerated: true, chosen: 'first', regenError: true, firstValidation: val(['unsupported_causal']), finalValidation: val(['unsupported_causal']) }), 'ai', 1003);

    const now = (await getKeyInsightMetrics('ai'))!;
    check('total +4', now.total - base.total === 4, `${now.total - base.total}`);
    check('firstPassClean +1', now.firstPassClean - base.firstPassClean === 1);
    check('regenerated +3', now.regenerated - base.regenerated === 3);
    check('resolved +1', now.resolved - base.resolved === 1);
    check('unresolved +2', now.unresolved - base.unresolved === 2, `${now.unresolved - base.unresolved}`);
    check('regenError +1', now.regenError - base.regenError === 1);
    check('codeCounts.intent_assertion +1', (now.codeCounts.intent_assertion ?? 0) - (base.codeCounts.intent_assertion ?? 0) === 1);
}

function testThresholds() {
    console.log('\n--- 임계값 판정(순수 함수) ---');
    const mk = (o: Partial<KeyInsightMetrics>): KeyInsightMetrics => ({ total: 0, firstPassClean: 0, regenerated: 0, resolved: 0, unresolved: 0, regenError: 0, chosenRegen: 0, codeCounts: {}, updatedAt: 0, ...o });

    // 표본 부족
    let v = evaluateKeyInsightThresholds(mk({ total: 50 }));
    check('표본부족 → not ready & 보류', !v.ready && v.recommendations.some(r => r.includes('보류')));

    // 미해소율 > 5%
    v = evaluateKeyInsightThresholds(mk({ total: DECISION_MIN_SAMPLE, unresolved: 20 }));
    check('미해소율>5% 권고', v.ready && v.recommendations.some(r => r.includes('미해소율')));

    // 재생성률 > 15%
    v = evaluateKeyInsightThresholds(mk({ total: DECISION_MIN_SAMPLE, regenerated: 60 }));
    check('재생성률>15% 권고', v.recommendations.some(r => r.includes('재생성률')));

    // 재생성률<1% & FN>10% → LLM 게이트
    v = evaluateKeyInsightThresholds(mk({ total: DECISION_MIN_SAMPLE, regenerated: 1 }), 0.5);
    check('저재생성 & 고FN → LLM 게이트 권고', v.recommendations.some(r => r.includes('LLM 게이트')));

    // 특정 코드 40% 초과
    v = evaluateKeyInsightThresholds(mk({ total: DECISION_MIN_SAMPLE, regenerated: 10, codeCounts: { unsupported_causal: 8, missing_action: 1 } }));
    check('최다코드>40% 표적 권고', v.recommendations.some(r => r.includes('unsupported_causal')));

    // 전부 임계값 이내(어떤 코드도 40% 미만이 되도록 균등 분포)
    v = evaluateKeyInsightThresholds(mk({ total: DECISION_MIN_SAMPLE, regenerated: 10, unresolved: 2, codeCounts: { a: 1, b: 1, c: 1 } as any }));
    check('정상 → 현행 유지', v.recommendations.some(r => r.includes('현행 유지')), v.recommendations.join(' | '));
}

async function run() {
    console.log('=== Key Insight 지표/임계값 테스트 ===');
    await testRecording();
    testThresholds();
    console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
    if (fail > 0) process.exit(1);
}
run();
