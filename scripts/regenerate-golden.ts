/**
 * 구현본으로 클러스터를 재생성하여 사람이 판정할 수 있는 카드를 출력.
 * 골든 3장 원본 클러스터가 오면 scripts/fixtures/golden-clusters.json에 넣고 실행.
 * 없으면 대표 클러스터(라틴 헤드라인 / 순수 한국어(R7) / 무관혼재(mixedness))로 스모크.
 *
 *   npx tsx scripts/regenerate-golden.ts
 *   npx tsx scripts/regenerate-golden.ts --file=scripts/fixtures/golden-clusters.json
 */
import * as dotenv from 'dotenv'; import * as fs from 'fs'; import * as path from 'path';
for (const f of ['.env.local', '.env.development.local', '.env']) { const p = path.join(process.cwd(), f); if (fs.existsSync(p)) dotenv.config({ path: p }); }
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FLASH_MODEL } from '../src/lib/gemini-models';
import { generateIssueFromCluster } from '../src/lib/gemini';
import { renderCard } from '../src/lib/generators/render-card';
import { NewsItem } from '../src/types';

function mk(id: string, title: string, desc: string, source: string): NewsItem {
    return { id, title, description: desc, url: `https://${source.toLowerCase().replace(/\s/g, '')}.com/${id}`, source, publishedAt: new Date('2026-07-14') };
}

// 대표 스모크 클러스터 3종
const SMOKE: { name: string; cluster: NewsItem[] }[] = [
    {
        name: 'AI규제(라틴 헤드라인) — 다중 실소스',
        cluster: [
            mk('r1', 'EU finalizes high-risk AI safety audit mandate with revenue-based fines', 'Third-party audits required for frontier models; penalties scale with global revenue.', 'Reuters'),
            mk('r2', 'AI Act enforcement: pre-market conformity assessment detailed', 'Regulators publish conformity assessment procedure for high-risk systems.', 'TechCrunch'),
            mk('r3', 'Compliance auditing firms report surge in AI audit demand', 'Third-party AI audit market grows sharply as rules tighten.', 'The Verge'),
            mk('r4', 'Startups warn AI compliance costs create barriers to entry', 'Small AI firms say audit and monitoring costs are prohibitive.', 'VentureBeat'),
        ],
    },
    {
        name: '배터리 광물(순수 한국어 헤드라인 유발) — R7 테스트',
        cluster: [
            mk('b1', 'Resource nations tighten critical mineral export controls', 'Several producer nations impose new export restrictions on lithium and nickel.', 'Bloomberg'),
            mk('b2', 'Lithium and nickel price volatility widens', 'Battery raw material prices swing amid supply uncertainty.', 'Reuters'),
            mk('b3', 'Korean battery makers announce refining and recycling in-house investment', 'LGES and peers invest to internalize refining and recycling capacity.', 'Electrive'),
        ],
    },
    {
        name: '무관혼재 — mixedness 테스트',
        cluster: [
            mk('m1', 'A country streamlines AI data center permitting process', 'Government consolidates administrative steps for data center approval.', 'Reuters'),
            mk('m2', 'Unrelated startup opens new GPU cloud region', 'A firm launches a new cloud region for GPU workloads.', 'TechCrunch'),
            mk('m3', 'Standards body circulates model evaluation methodology draft', 'A standards group shares a draft evaluation methodology for review.', 'The Verge'),
        ],
    },
];

async function main() {
    const fileArg = process.argv.find(a => a.startsWith('--file='));
    const key = process.env.GEMINI_API_KEY;
    if (!key) { console.log('GEMINI_API_KEY 없음 — 종료'); return; }
    const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: FLASH_MODEL });

    let sets = SMOKE;
    if (fileArg) {
        const raw = JSON.parse(fs.readFileSync(fileArg.split('=')[1], 'utf-8'));
        sets = raw.map((c: any, i: number) => ({ name: c.name || `golden-${i + 1}`, cluster: c.cluster || c }));
    }

    for (const s of sets) {
        console.log(`\n========== ${s.name} (clusterSize=${s.cluster.length}) ==========`);
        try {
            const issue = await generateIssueFromCluster(model, s.cluster, []);
            if (!issue) { console.log('  ⚠ null (생성 실패)'); continue; }
            console.log(renderCard(issue));
        } catch (e) { console.log('  ✗', (e as Error).message); }
    }
}
main().catch(e => { console.error(e); process.exit(1); });
