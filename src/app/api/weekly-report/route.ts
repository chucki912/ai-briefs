import { NextResponse } from 'next/server';
import { kvSet } from '@/lib/store';
import { ReportType } from '@/types';
import { waitUntil } from '@vercel/functions';
import { collectCorpus } from '@/lib/weekly/corpus';
import { runDeterministicPasses, currentIsoWeekDates } from '@/lib/weekly/pipeline';
import { isoWeekKey } from '@/lib/thread-index';
import { kvThreadIndexStore } from '@/lib/weekly/thread-index-store';
import { makeWebBoost } from '@/lib/weekly/prior-boost';
import { generateWeeklyReportContent } from '@/lib/weekly/report-gen';
import { renderWeeklyReport, type ShowDemoted } from '@/lib/weekly/render';

// 주간 트렌드 리포트 v2 (PASS 0~7). Vercel Fluid Compute 전제. 본문 생성(PRO+grounding)이
// 지배적 비용이라 Deep Dive와 동일 상한. 스레드 간 동시 2 + 결정론 길이 보정으로 재생성 감축.
export const maxDuration = 800;

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const domain: 'ai' | 'battery' = body.domain === 'battery' ? 'battery' : 'ai';
        const showDemoted: ShowDemoted = ['full', 'titles', 'off'].includes(body.showDemoted) ? body.showDemoted : 'titles';
        // dryRun: threadIndex 미기록(검증용). 스펙: 검증 전 기록은 이후 8주 등급 계산을 오염.
        const dryRun: boolean = body.dryRun === true;

        const jobId = `weekly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await kvSet(`weekly_job:${jobId}`, { status: 'collecting', progress: 5 }, 3600);

        waitUntil((async () => {
            try {
                const asOf = new Date();
                const dates = currentIsoWeekDates(asOf);
                const isoWeek = isoWeekKey(dates[0]);

                // PASS 0: 수집·정규화
                await kvSet(`weekly_job:${jobId}`, { status: 'collecting', progress: 10 }, 3600);
                const items = await collectCorpus(dates, domain);

                // 아이템 0건: 승격 0건 리포트로 정상 종료(200) — 스펙: 없는 트렌드 만들지 않는다
                if (items.length === 0) {
                    const emptyMd = renderWeeklyReport({ isoWeek, domain, threads: [], demoted: [], promotedCount: 0, attemptTraces: {} }, { showDemoted });
                    await kvSet(`weekly_job:${jobId}`, {
                        status: 'completed', progress: 100, report: emptyMd,
                        reportType: 'weekly' satisfies ReportType, promotedCount: 0, demotedCount: 0, isoWeek,
                    }, 3600);
                    return;
                }

                // PASS 1~3 (+2.5): 클러스터링·게이트·등급·웹보강. persist=true로 이번 주 증분 기록.
                await kvSet(`weekly_job:${jobId}`, { status: 'clustering', progress: 25, message: `${items.length}개 항목 클러스터링·판정 중...` }, 3600);
                const result = await runDeterministicPasses({
                    dates, domain, asOf, isoWeek,
                    store: kvThreadIndexStore, persist: !dryRun,
                    webBoost: makeWebBoost(), items,
                });

                // PASS 4~7: 승격 스레드 본문·판단·구조화·검증(동시 2). 승격 0건이면 빈 threads.
                await kvSet(`weekly_job:${jobId}`, { status: 'generating', progress: 55, message: `승격 ${result.promoted.length}건 본문 생성 중...` }, 3600);
                const content = await generateWeeklyReportContent(result, items, { concurrency: 2 });

                const report = renderWeeklyReport(content, { showDemoted });

                // dryRun 진단: 스레드별 확정 사실값(승인 검증용)
                const threadsDebug = dryRun ? content.threads.map(t => {
                    const g = result.promoted.find(p => p.threadKey === t.threadKey);
                    return {
                        threadKey: t.threadKey, grade: t.grade, motionTypes: t.motionTypes,
                        observedDates: t.observedDates, publisherCount: g?.gate.publisherCount ?? t.anchorSourceIds.length,
                        priorWeeksInternal: t.priorWeeksInternal, metricsUsed: t.metricsUsed,
                        industryTags: g?.gate.industryTags ?? [],
                    };
                }) : undefined;

                await kvSet(`weekly_job:${jobId}`, {
                    status: 'completed', progress: 100, report,
                    reportType: 'weekly' satisfies ReportType,
                    promotedCount: content.promotedCount,
                    demotedCount: content.demoted.length,
                    isoWeek, dryRun,
                    attemptTraces: content.attemptTraces, // 진단(UI 미노출)
                    ...(threadsDebug ? { threadsDebug } : {}),
                }, 3600);
                console.log(`[Weekly v2 ${jobId}] 완료: 승격 ${content.promotedCount}, 강등 ${content.demoted.length}`);

            } catch (error: unknown) {
                console.error(`[Weekly v2 ${jobId}] Failed:`, error);
                await kvSet(`weekly_job:${jobId}`, { status: 'failed', error: (error as Error)?.message ?? 'unknown' }, 3600);
            }
        })());

        return NextResponse.json({ success: true, data: { jobId, message: 'Weekly trend report v2 generation started' } });

    } catch (error) {
        console.error('Error in weekly report API:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
