import { NextResponse } from 'next/server';
import { generateTrendReport } from '@/lib/gemini';
import { kvSet, kvGet } from '@/lib/store';
import { IssueItem } from '@/types';
import { waitUntil } from '@vercel/functions';

// Vercel Pro allows up to 300 seconds (5 minutes)
export const maxDuration = 300;

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { issue } = body as { issue: IssueItem };

        if (!issue) return NextResponse.json({ error: 'Issue is required' }, { status: 400 });

        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Initial status
        await kvSet(`trend_job:${jobId}`, { status: 'generating', progress: 10 }, 3600);

        // Run Trend Report Generation in background (Monolithic)
        waitUntil((async () => {
            try {
                // generateTrendReport now handles EVERYTHING (Research + Synthesis) internally
                // because Vercel Pro timeout (300s) is sufficient.
                const report = await generateTrendReport(issue, '');

                if (report) {
                    await kvSet(`trend_job:${jobId}`, {
                        status: 'completed',
                        progress: 100,
                        report
                    }, 3600);
                } else {
                    throw new Error('Report generation returned null');
                }
            } catch (error: any) {
                console.error(`[Job ${jobId}] Generation Failed:`, error);
                await kvSet(`trend_job:${jobId}`, { status: 'failed', error: error.message }, 3600);
            }
        })());

        return NextResponse.json({ success: true, data: { jobId, message: 'Trend report generation started' } });

    } catch (error) {
        console.error('Error in trend report API:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
