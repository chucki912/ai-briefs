/**
 * 최종 재생성 — 결정 4종(size 하한 없음 / MIN_SOURCED_FACTS=2 / C14 outlet≥2 / C13 high-게이트) 반영 후
 * B 파이프라인 top-5 카드 전문 산출 + BB 커버리지 회계 한 줄.
 *   npx tsx scripts/final-b5.ts
 */
import * as dotenv from 'dotenv'; import * as fs from 'fs'; import * as path from 'path';
for (const f of ['.env.local', '.env.development.local', '.env']) { const p = path.join(process.cwd(), f); if (fs.existsSync(p)) dotenv.config({ path: p }); }
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FLASH_MODEL } from '../src/lib/gemini-models';
import { fetchAllNews } from '../src/lib/collectors/news-fetcher';
import { generateIssueFromCluster } from '../src/lib/gemini';
import { renderCard } from '../src/lib/generators/render-card';
import { distinctOutlets, isPressDomain } from '../src/lib/analyzers/structured-checks';
import { NewsItem } from '../src/types';

const keyTerms = ['OpenAI', 'Anthropic', 'Google', 'Meta', 'Microsoft', 'NVIDIA', 'Apple AI', 'xAI', 'Mistral', 'GPT', 'Claude', 'Gemini', 'Llama', 'Sora', 'Reasoning', 'o1', 'o3', 'Agent', 'Robot', 'Physical Intelligence', 'Quantum', 'Semiconductor', 'HBM', 'Regulation', 'Safety', 'Copyright', 'Policy', 'Lawsuit'];
function cluster(items: NewsItem[]): NewsItem[][] {
    const m = new Map<string, NewsItem[]>();
    for (const it of items) { let c = 'Global Trends'; const t = (it.title + ' ' + it.description).toLowerCase(); for (const k of keyTerms) { if (t.includes(k.toLowerCase())) { c = k; break; } } if (!m.has(c)) m.set(c, []); m.get(c)!.push(it); }
    return Array.from(m.values()).sort((a, b) => b.length - a.length);
}

async function main() {
    const key = process.env.GEMINI_API_KEY; if (!key) { console.log('no key'); return; }
    const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: FLASH_MODEL });
    const news = await fetchAllNews();
    const nonG = news.filter(n => n.source !== 'Google News');
    const gCount = news.length - nonG.length;
    console.log(`# BB 커버리지 회계: 수집 ${news.length} = Google ${gCount}(${Math.round((gCount / news.length) * 100)}%) + 비-Google ${nonG.length}`);
    const clB = cluster(nonG);
    console.log(`# B 클러스터 ${clB.length}개, size 분포: [${clB.map(c => c.length).join(', ')}]`);

    const top = clB.slice(0, 5);
    let passN = 0;
    for (let i = 0; i < top.length; i++) {
        const issue = await generateIssueFromCluster(model, top[i], []);
        console.log(`\n═══ B#${i + 1} (size=${top[i].length}) → ${issue ? 'PASS' : 'DEAD'} ═══`);
        if (issue) {
            passN++;
            const refs = issue.sourceRefs || [];
            const indep = refs.filter(s => !isPressDomain(s.url));
            console.log(`  [outlet 재검산] 정규화 distinct=${distinctOutlets(refs)} / 독립(프레스 제외)=${distinctOutlets(indep)} / conf=${issue.confidence}`);
            console.log(renderCard(issue));
        }
    }
    console.log(`\n# 최종: ${passN}/5 발행 가능`);
}
main().catch(e => { console.error(e); process.exit(1); });
