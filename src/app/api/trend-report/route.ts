import { NextResponse } from 'next/server';
import { generateTrendReport } from '@/lib/gemini';
import { AI_DEEP_DIVE_DOMAIN } from '@/lib/deep-dive-pipeline';
import { kvSet, kvGet } from '@/lib/store';
import { IssueItem } from '@/types';
import { waitUntil } from '@vercel/functions';

const JOB_KEY = (jobId: string) => `${AI_DEEP_DIVE_DOMAIN.jobKeyPrefix}:${jobId}`;

// Vercel Pro allows up to 300 seconds (5 minutes)
export const maxDuration = 300;

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { issue } = body as { issue: IssueItem };

        if (!issue) return NextResponse.json({ error: 'Issue is required' }, { status: 400 });

        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Initial status
        await kvSet(JOB_KEY(jobId), { status: 'generating', progress: 10 }, 3600);

        // Run Trend Report Generation in background (Monolithic)
        waitUntil((async () => {
            try {
                // generateTrendReport now handles EVERYTHING (Research + Synthesis) internally
                // because Vercel Pro timeout (300s) is sufficient.
                const result = await generateTrendReport(issue, '');

                if (result) {
                    await kvSet(JOB_KEY(jobId), {
                        status: 'completed',
                        progress: 100,
                        report: result.markdown, // 파생 마크다운(renderDeepDiveB 산출, B유형) — 기존 프론트 계약 유지
                        structured: result.structured, // JSON 원본 (source of truth)
                        reportType: result.reportType,
                        triangulation: result.triangulation, // FAIL_MODE='tag' 시 depthWarning 판별용 (pass=false)
                        contentGate: result.contentGate, // 판단 완결성 게이트 결과 (tag 모드 미달 판별용)
                    }, 3600);
                } else {
                    // null = 게이트 폐기가 아닌 원인 미상 실패(API 오류 등) — 폐기 사유는 DeepDiveDiscardError로 별도 전파됨
                    throw new Error('Gemini 생성 오류로 리포트 미생성 (일시적 오류 가능 — 재시도 요망)');
                }
            } catch (error: any) {
                console.error(`[Job ${jobId}] Generation Failed:`, error);
                await kvSet(JOB_KEY(jobId), { status: 'failed', error: error.message }, 3600);
            }
        })());

        return NextResponse.json({ success: true, data: { jobId, message: 'Trend report generation started' } });

    } catch (error) {
        console.error('Error in trend report API:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
