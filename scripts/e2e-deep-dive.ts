/** Deep Dive 2-pass e2e 검증: 실제 브리프 1건 → 생성 → KV 저장 → 재조회.
 *  npx tsx scripts/e2e-deep-dive.ts — DoD 확인용 일회성 스크립트. */
import { config } from 'dotenv';
config({ path: '.env.local' });

(async () => {
    // env 로드 후 import (모듈 로드 시점에 GEMINI_API_KEY를 읽는 구조라 정적 import 금지)
    const { generateTrendReport } = await import('../src/lib/gemini');
    const { kvSet, kvGet } = await import('../src/lib/store');
    const brief = require('../data/briefs/2026-01-30.json');
    // 사용법: npx tsx scripts/e2e-deep-dive.ts [issueIndex] (기본 3)
    const issueIndex = Number(process.argv[2] ?? 3);
    const issue = brief.issues[issueIndex];

    console.log(`E2E 대상: "${issue.headline}" | 입력 소스 ${issue.sources.length}개`);
    const result = await generateTrendReport(issue, '');
    if (!result) {
        console.error('E2E 실패: generateTrendReport가 null 반환');
        process.exit(1);
    }

    // route.ts와 동일한 레코드 형태로 KV 저장 → 재조회로 확인
    const jobKey = 'trend_job:e2e-structured-test';
    await kvSet(jobKey, {
        status: 'completed',
        progress: 100,
        report: result.markdown,
        structured: result.structured,
        reportType: result.reportType,
        triangulation: result.triangulation,
        contentGate: result.contentGate,
    }, 3600);
    const record = await kvGet<any>(jobKey);

    console.log('\n===== KV 레코드 확인 =====');
    console.log(`report(markdown): ${typeof record.report}, ${record.report.length}자`);
    console.log(`structured: ${typeof record.structured} | reportType: ${record.reportType} | triangulation.pass: ${record.triangulation.pass}`);
    console.log(`contentGate: pass=${record.contentGate.pass} failures=${record.contentGate.failures.length}`, record.contentGate.failures.length ? JSON.stringify(record.contentGate.failures, null, 1) : '');
    console.log('\n===== structured.anchor =====');
    console.log(JSON.stringify(record.structured.anchor, null, 2));
    console.log('\n===== structured.soWhat =====');
    console.log(JSON.stringify(record.structured.soWhat, null, 2));
    console.log('\n===== structured.watchlist =====');
    console.log(JSON.stringify(record.structured.watchlist, null, 2));
    console.log('\n===== 파생 마크다운 (앞 35줄) =====');
    console.log(record.report.split('\n').slice(0, 35).join('\n'));
})();
