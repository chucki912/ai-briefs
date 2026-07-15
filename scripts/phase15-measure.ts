/**
 * Phase 1.5 실측 — 프롬프트 수정(142/190 삭제·198 조건부·framework none·China/US 제거·레지스터 중립화) 반영 후
 * 30건을 '프로덕션 경로(generateIssueFromCluster)'로 재생성하여:
 *   - framework='none' 비율 (J)
 *   - confidence 분포 (C9' baseline, G)
 *   - 전 슬롯 텍스트 덤프 → [L] 5종 + 슬롯 위치(F 환각 이주) 수기 라벨용
 * 를 산출한다. 결과는 reports/phase15-cards.json.
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FLASH_MODEL } from '../src/lib/gemini-models';
import { generateIssueFromCluster } from '../src/lib/gemini';
import { NewsItem } from '../src/types';

for (const f of ['.env.local', '.env.development.local', '.env']) {
    const p = path.join(process.cwd(), f);
    if (fs.existsSync(p)) dotenv.config({ path: p });
}
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 30;

interface Fx { id: string; category: string; title: string; facts: string[]; expectedAudience?: string }
function buildCluster(c: Fx): NewsItem[] {
    const base = { source: 'eval-fixture', publishedAt: new Date(0), category: c.category };
    return [
        { id: `${c.id}-0`, title: c.title, description: c.facts.join('. '), url: `https://example.com/${c.id}/0`, ...base },
        ...c.facts.map((f, i) => ({ id: `${c.id}-${i + 1}`, title: f, description: f, url: `https://example.com/${c.id}/${i + 1}`, ...base })),
    ];
}

async function main() {
    const fx: Fx[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'key-insight-cases.json'), 'utf-8')).slice(0, LIMIT);
    const key = process.env.GEMINI_API_KEY;
    if (!key) { console.log('GEMINI_API_KEY 없음 — 종료'); return; }
    const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: FLASH_MODEL });

    const cards: any[] = [];
    for (const c of fx) {
        try {
            const issue = await generateIssueFromCluster(model, buildCluster(c), []);
            if (!issue) { console.log(`  ⚠ ${c.id} null`); continue; }
            cards.push({
                id: c.id, category: c.category, facts: c.facts,
                framework: issue.framework, confidence: issue.confidence,
                headline: issue.headline, singleTopicStatement: issue.singleTopicStatement,
                oneLineSummary: issue.oneLineSummary, keyFacts: issue.keyFacts,
                insight: issue.insight, soWhat: issue.soWhat,
            });
            console.log(`  ✓ ${c.id} fw=${issue.framework} conf=${issue.confidence}`);
        } catch (e) { console.log(`  ✗ ${c.id}: ${(e as Error).message}`); }
    }

    const noneN = cards.filter(c => c.framework === 'none').length;
    const conf = (v: string) => cards.filter(c => (c.confidence || '').toLowerCase() === v).length;
    console.log('\n=== 계측 ===');
    console.log(`생성 ${cards.length}건`);
    console.log(`framework='none' 비율: ${noneN}/${cards.length} = ${Math.round(noneN / cards.length * 100)}% (J)`);
    console.log(`confidence 분포(G baseline): high=${conf('high')} medium=${conf('medium')} low=${conf('low')} 미상=${cards.length - conf('high') - conf('medium') - conf('low')}`);

    const outDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'phase15-cards.json'), JSON.stringify({ cards }, null, 2), 'utf-8');
    console.log('\n저장: reports/phase15-cards.json');
}
main().catch(e => { console.error(e); process.exit(1); });
