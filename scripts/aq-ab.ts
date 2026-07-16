/**
 * AQ — 같은 오늘 뉴스로 A(Google 포함) vs B(수집서 Google 드롭) 비교.
 * + AR: 생성 중 [AR-DEBUG] 로그로 fact 폐기 × restsOn 관계 계측.
 *   npx tsx scripts/aq-ab.ts
 */
import * as dotenv from 'dotenv'; import * as fs from 'fs'; import * as path from 'path';
for (const f of ['.env.local', '.env.development.local', '.env']) { const p = path.join(process.cwd(), f); if (fs.existsSync(p)) dotenv.config({ path: p }); }
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FLASH_MODEL } from '../src/lib/gemini-models';
import { fetchAllNews } from '../src/lib/collectors/news-fetcher';
import { generateIssueFromCluster } from '../src/lib/gemini';
import { NewsItem } from '../src/types';

const keyTerms = ['OpenAI', 'Anthropic', 'Google', 'Meta', 'Microsoft', 'NVIDIA', 'Apple AI', 'xAI', 'Mistral', 'GPT', 'Claude', 'Gemini', 'Llama', 'Sora', 'Reasoning', 'o1', 'o3', 'Agent', 'Robot', 'Physical Intelligence', 'Quantum', 'Semiconductor', 'HBM', 'Regulation', 'Safety', 'Copyright', 'Policy', 'Lawsuit'];
function cluster(items: NewsItem[]): NewsItem[][] {
    const m = new Map<string, NewsItem[]>();
    for (const it of items) { let c = 'Global Trends'; const t = (it.title + ' ' + it.description).toLowerCase(); for (const k of keyTerms) { if (t.includes(k.toLowerCase())) { c = k; break; } } if (!m.has(c)) m.set(c, []); m.get(c)!.push(it); }
    return Array.from(m.values()).sort((a, b) => b.length - a.length);
}
const sizes = (cl: NewsItem[][]) => cl.map(c => c.length).join(',');

async function genTop(model: any, cl: NewsItem[][], label: string) {
    const top = cl.slice(0, 5);
    console.log(`\n--- ${label}: 클러스터 ${cl.length}개, size=[${sizes(cl)}], top-5 생성 ---`);
    let survived = 0;
    for (let i = 0; i < top.length; i++) {
        const c = top[i];
        const nonG = c.filter(n => !/news\.google\.com/.test(n.url)).length;
        const issue = await generateIssueFromCluster(model, c, []);
        console.log(`  [${label}#${i + 1}] size=${c.length} nonGoogle=${nonG} → ${issue ? 'PASS: ' + issue.headline : 'DEAD(C2)'}`);
        if (issue) survived++;
    }
    console.log(`  → ${label} 생존(C2+MIN=2): ${survived}/${top.length}`);
    return survived;
}

async function main() {
    const key = process.env.GEMINI_API_KEY; if (!key) { console.log('no key'); return; }
    const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: FLASH_MODEL });
    const news = await fetchAllNews();
    const g = news.filter(n => n.source === 'Google News');
    console.log(`# 수집 ${news.length} (Google ${g.length} = ${Math.round(g.length / news.length * 100)}%)`);

    const clA = cluster(news);
    const clB = cluster(news.filter(n => n.source !== 'Google News'));

    // Google-only 클러스터(B에서 사라지는 주제)
    const googleOnly = clA.filter(c => c.every(n => n.source === 'Google News'));
    console.log(`\n# A 클러스터 ${clA.length} / B 클러스터 ${clB.length}`);
    console.log(`# Google-only 클러스터(B에서 소멸 주제) ${googleOnly.length}개:`);
    googleOnly.forEach(c => console.log(`   - "${c[0].title.slice(0, 60)}" (size ${c.length})`));

    const sA = await genTop(model, clA, 'A(Google포함)');
    const sB = await genTop(model, clB, 'B(Google드롭)');
    console.log(`\n=== 결론: A 생존 ${sA}/5 vs B 생존 ${sB}/5 ===`);
}
main().catch(e => { console.error(e); process.exit(1); });
