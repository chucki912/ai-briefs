import { NextResponse } from 'next/server';
import { performDeepResearch, synthesizeReport } from '@/lib/gemini';
import { kvSet, kvGet } from '@/lib/store';
import { IssueItem } from '@/types';
import { waitUntil } from '@vercel/functions';

export const maxDuration = 60; // Each step must finish within 60s

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { issue, jobId, step = 'research' } = body as { issue: IssueItem; jobId?: string; step: 'research' | 'synthesize' };

        // 1단계: Research (Flash Model)
        if (step === 'research') {
            if (!issue) return NextResponse.json({ error: 'Issue is required for research' }, { status: 400 });

            const newJobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Set initial status
            await kvSet(`trend_job:${newJobId}`, { status: 'researching', progress: 10 }, 3600);

            // Run Research in background
            waitUntil((async () => {
                try {
                    const researchResult = await performDeepResearch(issue);
                    if (researchResult) {
                        await kvSet(`trend_job:${newJobId}`, {
                            status: 'research_completed',
                            progress: 50,
                            researchResult,
                            issue // Save issue for next step context if needed
                        }, 3600);
                    } else {
                        throw new Error('Research returned null');
                    }
                } catch (error: any) {
                    console.error(`[Job ${newJobId}] Research Failed:`, error);
                    await kvSet(`trend_job:${newJobId}`, { status: 'failed', error: error.message }, 3600);
                }
            })());

            return NextResponse.json({ success: true, data: { jobId: newJobId, message: 'Research started' } });
        }

        // 2단계: Synthesis (Pro Model)
        if (step === 'synthesize') {
            if (!jobId) return NextResponse.json({ error: 'Job ID is required for synthesis' }, { status: 400 });

            // Ensure we have research result
            const jobData: any = await kvGet(`trend_job:${jobId}`);
            if (!jobData || !jobData.researchResult) {
                return NextResponse.json({ error: 'Research result not found or expired' }, { status: 404 });
            }

            // Update status
            await kvSet(`trend_job:${jobId}`, { ...jobData, status: 'synthesizing', progress: 60 }, 3600);

            // Run Synthesis in background
            waitUntil((async () => {
                try {
                    const report = await synthesizeReport(jobData.issue || issue, jobData.researchResult);
                    if (report) {
                        await kvSet(`trend_job:${jobId}`, {
                            status: 'completed', // Final completion
                            progress: 100,
                            report
                        }, 3600);
                    } else {
                        throw new Error('Synthesis returned null');
                    }
                } catch (error: any) {
                    console.error(`[Job ${jobId}] Synthesis Failed:`, error);
                    await kvSet(`trend_job:${jobId}`, { status: 'failed', error: error.message }, 3600);
                }
            })());

            return NextResponse.json({ success: true, data: { jobId, message: 'Synthesis started' } });
        }

        return NextResponse.json({ error: 'Invalid step' }, { status: 400 });

    } catch (error) {
        console.error('Error in trend report API:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
