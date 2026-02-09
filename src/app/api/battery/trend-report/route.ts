import { NextResponse } from 'next/server';
import { generateBatteryTrendReport } from '@/lib/battery-gemini';
import { IssueItem } from '@/types';

// 배터리 트렌드 리포트 생성 API
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

        console.log('[Battery Trend API] 심층 리포트 생성 시작:', issue.headline);

        const report = await generateBatteryTrendReport(issue, '');

        if (report) {
            return NextResponse.json({
                success: true,
                data: report
            });
        } else {
            return NextResponse.json({
                success: false,
                error: '배터리 트렌드 리포트 생성에 실패했습니다.'
            });
        }

    } catch (error) {
        console.error('[Battery Trend API Error]', error);
        return NextResponse.json(
            { success: false, error: '배터리 트렌드 리포트 생성 중 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
