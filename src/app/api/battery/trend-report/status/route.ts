import { NextResponse } from 'next/server';
import { kvGet } from '@/lib/store';

// 배터리 트렌드 리포트 작업 상태 조회 API
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const jobId = searchParams.get('jobId');

        if (!jobId) {
            return NextResponse.json({ success: false, error: 'jobId is required' }, { status: 400 });
        }

        const jobStatus = await kvGet(`battery_trend_job:${jobId}`);

        if (!jobStatus) {
            return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            data: jobStatus
        });

    } catch (error) {
        console.error('[Battery Trend Status Error]', error);
        return NextResponse.json(
            { success: false, error: '작성 상태 확인 중 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
