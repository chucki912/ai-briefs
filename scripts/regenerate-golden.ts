/**
 * 라이브 프로덕션 경로로 오늘 뉴스 top-5 카드를 생성해 사람이 판정할 수 있게 렌더.
 * fetchAllNews → clusterNewsByTopic(복제, 프로덕션 동일) → slice(0,5) → generateIssueFromCluster.
 * 정제·선별 없음. SHA·시각 기록.
 *
 *   npx tsx scripts/regenerate-golden.ts            # 라이브 5장
 *   npx tsx scripts/regenerate-golden.ts --n=5
 */
import * as dotenv from 'dotenv'; import * as fs from 'fs'; import * as path from 'path'; import { execSync } from 'child_process';
for (const f of ['.env.local', '.env.development.local', '.env']) { const p = path.join(process.cwd(), f); if (fs.existsSync(p)) dotenv.config({ path: p }); }
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FLASH_MODEL } from '../src/lib/gemini-models';
import { fetchAllNews } from '../src/lib/collectors/news-fetcher';
import { generateIssueFromCluster } from '../src/lib/gemini';
import { renderCard } from '../src/lib/generators/render-card';
import { NewsItem } from '../src/types';

// 프로덕션 clusterNewsByTopic 복제 (gemini.ts와 동일)
const keyTerms = ['OpenAI', 'Anthropic', 'Google', 'Meta', 'Microsoft', 'NVIDIA', 'Apple AI', 'xAI', 'Mistral', 'GPT', 'Claude', 'Gemini', 'Llama', 'Sora', 'Reasoning', 'o1', 'o3', 'Agent', 'Robot', 'Physical Intelligence', 'Quantum', 'Semiconductor', 'HBM', 'Regulation', 'Safety', 'Copyright', 'Policy', 'Lawsuit'];
function clusterNewsByTopic(items: NewsItem[]): NewsItem[][] {
    const m = new Map<string, NewsItem[]>();
    for (const it of items) {
        let c = 'Global Trends';
        const t = (it.title + ' ' + it.description).toLowerCase();
        for (const k of keyTerms) { if (t.includes(k.toLowerCase())) { c = k; break; } }
        if (!m.has(c)) m.set(c, []);
        m.get(c)!.push(it);
    }
    return Array.from(m.values()).sort((a, b) => b.length - a.length);
}

async function main() {
    const nArg = process.argv.find(a => a.startsWith('--n='));
    const N = nArg ? parseInt(nArg.split('=')[1], 10) : 5;
    const key = process.env.GEMINI_API_KEY;
    if (!key) { console.log('GEMINI_API_KEY 없음 — 종료'); return; }

    let sha = 'unknown';
    try { sha = execSync('git rev-parse HEAD').toString().trim(); } catch { /* */ }
    console.log(`# 라이브 브리프 (프로덕션 경로) — SHA=${sha}  시각=${new Date().toISOString()}`);

    const news = await fetchAllNews();
    const clusters = clusterNewsByTopic(news);
    const top = clusters.slice(0, N);
    console.log(`# 수집 ${news.length} 아이템 → 클러스터 ${clusters.length} → top-${top.length}\n`);

    const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: FLASH_MODEL });
    for (let i = 0; i < top.length; i++) {
        const c = top[i];
        console.log(`\n===== [카드 ${i + 1}] 입력 클러스터 (size=${c.length}) =====`);
        c.forEach(n => console.log(`  - "${n.title}" — ${n.source}${/news\.google\.com/.test(n.url) ? ' (Google/미해석)' : ''}`));
        try {
            const issue = await generateIssueFromCluster(model, c, []);
            console.log(issue ? '\n' + renderCard(issue) : '  ⚠ null (생성 실패)');
        } catch (e) { console.log('  ✗', (e as Error).message); }
    }
}
main().catch(e => { console.error(e); process.exit(1); });
