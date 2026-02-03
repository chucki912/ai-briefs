import { NextResponse } from 'next/server';
import { generateTrendReport } from '@/lib/gemini';
import { kvSet } from '@/lib/store';
import { IssueItem } from '@/types';
import { waitUntil } from '@vercel/functions';

// Vercel Pro limit (300s), but explicitly setting to avoid timeouts on shorter plans
export const maxDuration = 60; // 60 seconds should be enough for Gemini Deep Research

// 1. 작업 시작 (POST)
export async function POST(req: Request) {
    try {
        const { issue } = await req.json() as { issue: IssueItem };

        if (!issue) {
            return NextResponse.json({ error: 'Issue data is required' }, { status: 400 });
        }

        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 초기 상태 저장
        await kvSet(`trend_job:${jobId}`, { status: 'processing', progress: 10 }, 3600);

        // 비동기 작업 시작 (waitUntil 사용)
        waitUntil((async () => {
            try {
                // deep research via Gemini Grounding (No manual scraping needed)
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
                console.error(`[Job ${jobId}] Failed:`, error);
                await kvSet(`trend_job:${jobId}`, {
                    status: 'failed',
                    error: error.message
                }, 3600);
            }
        })());

        return NextResponse.json({
            success: true,
            data: { jobId, message: 'Deep Research started available in background' }
        });

    } catch (error) {
        console.error('Error starting trend report:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
