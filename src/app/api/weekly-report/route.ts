import { NextResponse } from 'next/server';
import { clusterIssuesByAI, generateWeeklyReport } from '@/lib/weekly-report';
import { kvSet } from '@/lib/store';
import { getRecentIssues } from '@/lib/store';
import { waitUntil } from '@vercel/functions';

// Vercel Pro allows up to 300 seconds (5 minutes)
export const maxDuration = 300;

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const domain = body.domain || 'ai'; // 'ai' | 'battery'

        const jobId = `weekly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Initial status
        await kvSet(`weekly_job:${jobId}`, { status: 'collecting', progress: 5 }, 3600);

        // Run in background
        waitUntil((async () => {
            try {
                // Step 1: Collect last 7 days of issues
                console.log(`[Weekly Report] Collecting issues for domain: ${domain}...`);
                await kvSet(`weekly_job:${jobId}`, { status: 'collecting', progress: 10 }, 3600);

                const issues = await getRecentIssues(7);

                if (issues.length === 0) {
                    await kvSet(`weekly_job:${jobId}`, {
                        status: 'failed',
                        error: '최근 7일간 수집된 이슈가 없습니다.'
                    }, 3600);
                    return;
                }

                console.log(`[Weekly Report] Collected ${issues.length} issues. Starting clustering...`);

                // Step 2: AI Clustering
                await kvSet(`weekly_job:${jobId}`, {
                    status: 'clustering',
                    progress: 25,
                    message: `${issues.length}개 이슈를 주제별로 분류 중...`
                }, 3600);

                const clusters = await clusterIssuesByAI(issues);
                console.log(`[Weekly Report] Created ${clusters.length} clusters. Generating report...`);

                // Step 3: Generate Report
                await kvSet(`weekly_job:${jobId}`, {
                    status: 'generating',
                    progress: 50,
                    message: `${clusters.length}개 클러스터 종합 분석 중...`
                }, 3600);

                const report = await generateWeeklyReport(clusters, issues, domain);

                if (report) {
                    await kvSet(`weekly_job:${jobId}`, {
                        status: 'completed',
                        progress: 100,
                        report,
                        clusterCount: clusters.length,
                        issueCount: issues.length,
                    }, 3600);
                    console.log(`[Weekly Report] Generation complete!`);
                } else {
                    throw new Error('Report generation returned null');
                }

            } catch (error: any) {
                console.error(`[Weekly Job ${jobId}] Failed:`, error);
                await kvSet(`weekly_job:${jobId}`, { status: 'failed', error: error.message }, 3600);
            }
        })());

        return NextResponse.json({
            success: true,
            data: {
                jobId,
                message: 'Weekly trend report generation started',
            }
        });

    } catch (error) {
        console.error('Error in weekly report API:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
