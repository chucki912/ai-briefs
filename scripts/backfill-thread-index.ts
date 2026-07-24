/**
 * T2 백필 러너 — 최근 N주 일일 브리핑으로 threadIndex를 구성하고 주차별 분포를 보고한다.
 *
 * 실행(dry-run, 기록 없음 — 분포만 산출):
 *   npx tsx scripts/backfill-thread-index.ts
 * 실제 기록:
 *   npx tsx scripts/backfill-thread-index.ts --write
 * 옵션:
 *   --weeks=8            백필 주 수(기본 8)
 *   --domains=ai,battery 대상(기본 ai,battery)
 *   --asof=2026-07-24    기준일(기본 오늘, KST 무관 로컬)
 *   --write              threadIndex에 실제 기록(미지정 시 dry-run)
 *
 * 주의: prod KV(REDIS_URL)와 Gemini(GEMINI_API_KEY)에 접근한다. dotenv를 store 로드
 * 이전에 주입하기 위해 백필 코어는 동적 import한다(CJS 평가 순서 의존 회피).
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
for (const f of ['.env.local', '.env.development.local', '.env']) {
    const p = path.join(process.cwd(), f);
    if (fs.existsSync(p)) dotenv.config({ path: p });
}

function parseArgs() {
    const args = process.argv.slice(2);
    const get = (name: string) => {
        const hit = args.find(a => a.startsWith(`--${name}=`));
        return hit ? hit.split('=')[1] : undefined;
    };
    const weeks = Number(get('weeks') ?? 8);
    const domainsRaw = (get('domains') ?? 'ai,battery').split(',').map(s => s.trim()).filter(Boolean);
    const domains = domainsRaw.filter((d): d is 'ai' | 'battery' => d === 'ai' || d === 'battery');
    const asof = get('asof');
    const asOfDate = asof ? new Date(`${asof}T12:00:00`) : new Date();
    const write = args.includes('--write');
    return { weeks, domains, asOfDate, write };
}

async function main() {
    const { weeks, domains, asOfDate, write } = parseArgs();
    if (!process.env.REDIS_URL && !process.env.KV_REST_API_URL) {
        console.error('❌ REDIS_URL / KV_REST_API_URL 미설정 — .env.local 확인 필요(로컬에서 InMemory로 떨어지면 백필 무의미).');
        process.exit(1);
    }
    if (domains.length === 0) { console.error('❌ 유효 domain 없음'); process.exit(1); }

    console.log(`\n=== threadIndex 백필 ${write ? '(WRITE)' : '(DRY-RUN, 미기록)'} ===`);
    console.log(`기준일=${asOfDate.toISOString().slice(0, 10)} weeks=${weeks} domains=${domains.join(',')} prefix=${process.env.REDIS_PREFIX || 'ai_brief'}\n`);

    const { runBackfill } = await import('../src/lib/weekly/backfill');
    const { stats, threadsWritten } = await runBackfill({
        asOfDate, weeks, domains, write,
        onLog: (m) => console.log('  ' + m),
    });

    // ── 분포 리포트 ──────────────────────────────────────────────────────────
    console.log(`\n=== 주차별 스레드 분포 ===`);
    const header = ['isoWeek', 'domain', 'items', 'threads', 'gated', 'demoted', 'singleton', 'new', 'matched', 'M1'];
    console.log(header.map(h => h.padStart(9)).join(' '));
    for (const s of stats) {
        console.log([
            s.isoWeek, s.domain, s.itemCount, s.threadCount, s.gatedCount, s.demotedCount,
            s.singletonThreadCount, s.newThreadCount, s.matchedThreadCount, s.m1Count,
        ].map(v => String(v).padStart(9)).join(' '));
    }

    // ── 파편화/건강도 요약 ────────────────────────────────────────────────────
    console.log(`\n=== 건강도 요약 ===`);
    for (const domain of domains) {
        const ds = stats.filter(s => s.domain === domain && s.itemCount > 0);
        if (ds.length === 0) { console.log(`[${domain}] 관측 주 없음`); continue; }
        const sum = (f: (s: typeof ds[number]) => number) => ds.reduce((a, s) => a + f(s), 0);
        const items = sum(s => s.itemCount), threads = sum(s => s.threadCount);
        const singleton = sum(s => s.singletonThreadCount), gated = sum(s => s.gatedCount);
        const matched = sum(s => s.matchedThreadCount), m1 = sum(s => s.m1Count);
        const avgMembers = threads > 0 ? (items / threads).toFixed(2) : '0';
        const singletonRate = threads > 0 ? ((singleton / threads) * 100).toFixed(1) : '0';
        const gateRate = threads > 0 ? ((gated / threads) * 100).toFixed(1) : '0';
        const matchRate = threads > 0 ? ((matched / threads) * 100).toFixed(1) : '0';
        console.log(`[${domain}] 관측주=${ds.length} items=${items} threads=${threads} 평균멤버/스레드=${avgMembers}`);
        console.log(`        singleton율=${singletonRate}% (파편화 지표) | 게이트통과율=${gateRate}% | 매칭율=${matchRate}% | M1누적=${m1}`);
        if (Number(singletonRate) > 60) console.log(`        ⚠️ singleton율 60%↑ — 과도 파편화 가능. T3 이전 클러스터링 기준 조정 검토.`);
        if (Number(avgMembers) > 8) console.log(`        ⚠️ 평균 멤버 8↑ — 과도 병합(under-clustering) 가능. 메커니즘 분리 기준 강화 검토.`);
    }

    console.log(`\n${write ? `✅ threadIndex 기록 완료: ${threadsWritten} 스레드-주` : 'ℹ️ dry-run 종료(미기록). --write 로 실제 기록.'}\n`);
}

main().catch(err => { console.error('백필 실패:', err); process.exit(1); });
