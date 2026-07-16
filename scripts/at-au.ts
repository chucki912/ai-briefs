/**
 * AT + AU — (c) 수집드롭 확정 후, B 파이프라인 1회 실행으로:
 *  AT: 얇은 클러스터(size ≤ 2) 카드의 입력 원문 vs 생성 fact 대조 + size 하한별 카드 수.
 *  AU: C13(고신뢰 → restsOn fact 수 & 출처 outlet 다양성) 값별 생존 카드 수.
 *   npx tsx scripts/at-au.ts
 */
import * as dotenv from 'dotenv'; import * as fs from 'fs'; import * as path from 'path';
for (const f of ['.env.local', '.env.development.local', '.env']) { const p = path.join(process.cwd(), f); if (fs.existsSync(p)) dotenv.config({ path: p }); }
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FLASH_MODEL } from '../src/lib/gemini-models';
import { fetchAllNews } from '../src/lib/collectors/news-fetcher';
import { generateIssueFromCluster } from '../src/lib/gemini';
import { renderCard } from '../src/lib/generators/render-card';
import { NewsItem, IssueItem } from '../src/types';

const keyTerms = ['OpenAI', 'Anthropic', 'Google', 'Meta', 'Microsoft', 'NVIDIA', 'Apple AI', 'xAI', 'Mistral', 'GPT', 'Claude', 'Gemini', 'Llama', 'Sora', 'Reasoning', 'o1', 'o3', 'Agent', 'Robot', 'Physical Intelligence', 'Quantum', 'Semiconductor', 'HBM', 'Regulation', 'Safety', 'Copyright', 'Policy', 'Lawsuit'];
function cluster(items: NewsItem[]): NewsItem[][] {
    const m = new Map<string, NewsItem[]>();
    for (const it of items) { let c = 'Global Trends'; const t = (it.title + ' ' + it.description).toLowerCase(); for (const k of keyTerms) { if (t.includes(k.toLowerCase())) { c = k; break; } } if (!m.has(c)) m.set(c, []); m.get(c)!.push(it); }
    return Array.from(m.values()).sort((a, b) => b.length - a.length);
}

interface Row { i: number; size: number; survived: boolean; headline: string; conf: string; restsOnN: number; outletsRestsOn: number; outletsAll: number; }

async function main() {
    const key = process.env.GEMINI_API_KEY; if (!key) { console.log('no key'); return; }
    const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: FLASH_MODEL });
    const news = await fetchAllNews();
    const nonG = news.filter(n => n.source !== 'Google News');
    const clB = cluster(nonG);
    console.log(`# 수집 ${news.length} → 비-Google ${nonG.length} → B 클러스터 ${clB.length}개`);
    console.log(`# B size 분포(전체): [${clB.map(c => c.length).join(', ')}]`);

    // ── AT: size 하한별 하루 카드 수 (production = 하한 필터 후 slice(0,5)) ──
    const floorCount = (floor: number) => Math.min(5, clB.filter(c => c.length >= floor).length);
    console.log(`\n## AT size 하한별 하루 카드 수 (필터 후 top-5)`);
    console.log(`   하한 없음(>=1) → ${floorCount(1)}장`);
    console.log(`   size >= 2     → ${floorCount(2)}장`);
    console.log(`   size >= 3     → ${floorCount(3)}장`);

    // ── top-5 생성 ──
    const top = clB.slice(0, 5);
    const rows: Row[] = [];
    const cards: (IssueItem | null)[] = [];
    for (let i = 0; i < top.length; i++) {
        const c = top[i];
        const issue = await generateIssueFromCluster(model, c, []);
        cards.push(issue);
        let conf = '-', restsOnN = 0, outletsRestsOn = 0, outletsAll = 0, headline = '(DEAD C2)';
        if (issue) {
            headline = issue.headline;
            const ki = issue.keyInsight!;
            conf = ki.confidence;
            restsOnN = ki.restsOnFactIds.length;
            const factById = new Map((issue.structuredFacts || []).map(f => [f.id, f]));
            const refById = new Map((issue.sourceRefs || []).map(s => [s.id, s]));
            const outletOf = (sids: string[]) => new Set(sids.map(id => refById.get(id)?.outlet || refById.get(id)?.url || id));
            // restsOn fact들이 결박한 소스의 distinct outlet
            const restsOnSids = ki.restsOnFactIds.flatMap(fid => factById.get(fid)?.sourceIds || []);
            outletsRestsOn = outletOf(restsOnSids).size;
            const allSids = (issue.structuredFacts || []).flatMap(f => f.sourceIds);
            outletsAll = outletOf(allSids).size;
        }
        rows.push({ i: i + 1, size: c.length, survived: !!issue, headline, conf, restsOnN, outletsRestsOn, outletsAll });
        console.log(`  [B#${i + 1}] size=${c.length} → ${issue ? 'PASS' : 'DEAD(C2)'} conf=${conf} restsOn=${restsOnN} outlets(restsOn)=${outletsRestsOn} outlets(all)=${outletsAll} | ${headline}`);
    }

    // ── AT: 얇은 카드(size ≤ 2) 입력 원문 vs 생성 카드 전문 ──
    console.log(`\n## AT 얇은 카드(size ≤ 2) 입력 원문 대조 ──────────────────────────`);
    for (let i = 0; i < top.length; i++) {
        if (top[i].length > 2) continue;
        console.log(`\n─── B#${i + 1} (size=${top[i].length}) ───`);
        console.log(`【입력 기사 원문】`);
        top[i].forEach((n, k) => {
            console.log(`  [${k + 1}] (${n.source}) ${n.title}`);
            console.log(`      desc: ${(n.description || '(없음)').slice(0, 400)}`);
        });
        console.log(`【생성 카드】`);
        console.log(cards[i] ? renderCard(cards[i]!).split('\n').map(l => '  ' + l).join('\n') : '  (DEAD C2)');
    }

    // ── AU: C13 값별 생존 카드 수 ──
    console.log(`\n## AU C13(고신뢰 결박) 값별 생존 카드 수 ─────────────────────────`);
    console.log(`   생존 = high가 아니거나(자동통과), high면서 restsOn>=MIN_FACTS AND outlets(restsOn)>=MIN_OUTLETS`);
    const alive = rows.filter(r => r.survived);
    console.log(`   (기준: 오늘 B 생성 생존 카드 ${alive.length}장. conf/restsOn/outlets: ${alive.map(r => `#${r.i}[${r.conf},${r.restsOnN},${r.outletsRestsOn}]`).join(' ')})`);
    for (const mf of [2, 3]) {
        for (const mo of [1, 2, 3]) {
            const pass = alive.filter(r => r.conf !== 'high' || (r.restsOnN >= mf && r.outletsRestsOn >= mo)).length;
            console.log(`   MIN_FACTS=${mf} MIN_OUTLETS=${mo} → 생존 ${pass}/${alive.length}`);
        }
    }
    const highCards = alive.filter(r => r.conf === 'high');
    console.log(`   (high 카드 ${highCards.length}장만 C13 적용 대상: ${highCards.map(r => `#${r.i}`).join(',') || '없음'})`);
}
main().catch(e => { console.error(e); process.exit(1); });
