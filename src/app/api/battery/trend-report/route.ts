import { NextResponse } from 'next/server';
import { generateBatteryTrendReport } from '@/lib/battery-gemini';
import { BATTERY_DEEP_DIVE_DOMAIN } from '@/lib/deep-dive-pipeline';
import { kvSet } from '@/lib/store';
import { IssueItem } from '@/types';
import { waitUntil } from '@vercel/functions';

const JOB_KEY = (jobId: string) => `${BATTERY_DEEP_DIVE_DOMAIN.jobKeyPrefix}:${jobId}`;

export const maxDuration = 300; // Vercel timeout up to 5 min

// 배터리 트렌드 리포트 생성 API (비동기 처리)
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { issue } = body as { issue: IssueItem };

        if (!issue || !issue.headline) {
            return NextResponse.json(
                { success: false, error: 'Issue data is required' },
                { status: 400 }
            );
        }

        const jobId = `battery_job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log('[Battery Trend API] 작업 시작:', jobId, issue.headline);

        // 초기 상태 설정
        await kvSet(JOB_KEY(jobId), { status: 'generating', progress: 10 }, 3600);

        // 백그라운드 작업 실행 (Vercel waitUntil 사용)
        waitUntil((async () => {
            try {
                const result = await generateBatteryTrendReport(issue, '');

                if (result) {
                    await kvSet(JOB_KEY(jobId), {
                        status: 'completed',
                        progress: 100,
                        report: result.markdown, // 파생 마크다운(renderDeepDiveB 산출, B유형) — 기존 프론트 계약 유지
                        structured: result.structured, // JSON 원본 (source of truth)
                        reportType: result.reportType,
                        triangulation: result.triangulation,
                        contentGate: result.contentGate,
                    }, 3600);
                } else {
                    // null = 게이트 폐기가 아닌 원인 미상 실패(API 오류 등) — 폐기 사유는 DeepDiveDiscardError로 별도 전파됨
                    throw new Error('Gemini 생성 오류로 리포트 미생성 (일시적 오류 가능 — 재시도 요망)');
                }
            } catch (error: any) {
                console.error(`[Battery Job ${jobId}] 실패:`, error);
                await kvSet(JOB_KEY(jobId), {
                    status: 'failed',
                    error: error.message || '리포트 생성 중 오류가 발생했습니다.'
                }, 3600);
            }
        })());

        // 즉시 작업 ID 반환
        return NextResponse.json({
            success: true,
            data: { jobId, message: '배터리 리포트 분석을 시작했습니다.' }
        });

    } catch (error) {
        console.error('[Battery Trend API Error]', error);
        return NextResponse.json(
            { success: false, error: '배터리 트렌드 리포트 생성 중 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
