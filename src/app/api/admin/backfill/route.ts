import { NextResponse } from 'next/server';
import { kvSet } from '@/lib/store';
import { waitUntil } from '@vercel/functions';
import { runBackfill } from '@/lib/weekly/backfill';

// threadIndex 재백필 — Vercel(안정 KV)에서 실행. 로컬→prod 네트워크가 장시간 작업을
// 못 버텨(반복 fetch failed) 배포 환경으로 이관. write-재구성만(멱등). reset(스냅샷·폐기)은
// 로컬 스크립트 전용이며 route에는 두지 않는다(안전).
export const maxDuration = 800;

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const weeks = Number(body.weeks ?? 8);
        const domainsRaw: string[] = Array.isArray(body.domains) ? body.domains : ['ai', 'battery'];
        const domains = domainsRaw.filter((d): d is 'ai' | 'battery' => d === 'ai' || d === 'battery');
        const asOfDate = typeof body.asof === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.asof)
            ? new Date(`${body.asof}T12:00:00`) : new Date();

        if (domains.length === 0) return NextResponse.json({ error: 'no valid domains' }, { status: 400 });

        const jobId = `backfill_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        await kvSet(`backfill_job:${jobId}`, { status: 'running', progress: 0, log: [] }, 3600);

        waitUntil((async () => {
            const log: string[] = [];
            try {
                const { stats, threadsWritten } = await runBackfill({
                    asOfDate, weeks, domains, write: true,
                    onLog: (m) => { log.push(m); },
                });
                await kvSet(`backfill_job:${jobId}`, {
                    status: 'completed', progress: 100, threadsWritten,
                    weeks, domains, asof: asOfDate.toISOString().slice(0, 10),
                    stats, log,
                }, 3600);
            } catch (error: unknown) {
                await kvSet(`backfill_job:${jobId}`, { status: 'failed', error: (error as Error)?.message ?? 'unknown', log }, 3600);
            }
        })());

        return NextResponse.json({ success: true, data: { jobId, message: 'backfill started' } });
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(req: Request) {
    const jobId = new URL(req.url).searchParams.get('jobId');
    if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 });
    const { kvGet } = await import('@/lib/store');
    const job = await kvGet(`backfill_job:${jobId}`);
    return NextResponse.json({ success: true, data: job });
}
