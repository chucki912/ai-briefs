/**
 * Key Insight 운영 지표 조회 + 임계값 판정.
 *
 *   npx tsx scripts/key-insight-metrics.ts               # ai 도메인
 *   npx tsx scripts/key-insight-metrics.ts --domain=battery
 *   npx tsx scripts/key-insight-metrics.ts --fn=0.15     # 최근 평가 False-Negative율 주입 후 판정
 *
 * 프로덕션 생성 시 recordKeyInsightMetrics()가 KV에 누적한 러닝 카운터를 읽어,
 * evaluateKeyInsightThresholds()의 기준선과 비교해 다음 행동을 자동 권고한다.
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { getKeyInsightMetrics, evaluateKeyInsightThresholds } from '../src/lib/analyzers/key-insight-metrics';

for (const f of ['.env.local', '.env.development.local', '.env']) {
    const p = path.join(process.cwd(), f);
    if (fs.existsSync(p)) dotenv.config({ path: p });
}

function arg(name: string): string | undefined {
    const h = process.argv.slice(2).find(a => a.startsWith(`--${name}=`));
    return h ? h.split('=')[1] : undefined;
}

async function main() {
    const domain = (arg('domain') as 'ai' | 'battery') || 'ai';
    const fnRaw = arg('fn');
    const fn = fnRaw !== undefined ? parseFloat(fnRaw) : undefined;

    const m = await getKeyInsightMetrics(domain);
    console.log(`=== Key Insight 지표 (domain=${domain}) ===`);
    if (!m || m.total === 0) {
        console.log('아직 누적 지표 없음. 프로덕션 생성 또는 평가 스크립트 실행 후 다시 조회하세요.');
        console.log('(evaluate-key-insight.ts 를 실행하면 프로덕션 경로가 지표를 적재합니다.)');
        return;
    }

    console.log(JSON.stringify(m, null, 2));

    const verdict = evaluateKeyInsightThresholds(m, fn);
    console.log('\n=== 임계값 판정 ===');
    console.log(`표본: ${verdict.stats.sample} (결정 최소표본 도달: ${verdict.ready ? 'O' : 'X'})`);
    console.log(`재생성률: ${(verdict.stats.regenRate * 100).toFixed(1)}% / 미해소율: ${(verdict.stats.unresolvedRate * 100).toFixed(1)}% / 재생성중 해소율: ${(verdict.stats.resolveRate * 100).toFixed(1)}%`);
    if (verdict.stats.topCode) console.log(`최다 위반코드: ${verdict.stats.topCode.code} (${(verdict.stats.topCode.share * 100).toFixed(0)}%)`);
    if (fn !== undefined) console.log(`주입된 False-Negative율: ${(fn * 100).toFixed(0)}%`);
    console.log('\n권고:');
    verdict.recommendations.forEach(r => console.log(`  - ${r}`));
}

main().catch(e => { console.error('오류:', e); process.exit(1); });
