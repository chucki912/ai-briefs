import { NextResponse } from 'next/server';
import { getBriefByDate, getAllBriefs } from '@/lib/store';

// 배터리 브리프 조회 API
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get('date');
        const list = searchParams.get('list');

        // 1. 배터리 브리핑 목록 조회
        if (list === 'true') {
            const allBriefs = await getAllBriefs(50);
            // battery- 접두사가 붙은 리포트만 필터링
            const batteryBriefs = allBriefs.filter(b => b.id.startsWith('battery-'));

            return NextResponse.json({
                success: true,
                data: batteryBriefs.map(b => ({
                    id: b.id,
                    date: b.date.replace('battery-', ''), // UI 표시용 날짜 정규화
                    dayOfWeek: b.dayOfWeek,
                    totalIssues: b.totalIssues,
                    generatedAt: b.generatedAt
                }))
            });
        }

        // 2. 특정 날짜 조회 (기본값: 오늘)
        const nowDate = new Date();
        const dateStr = dateParam || nowDate.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

        // 배터리 브리프 조회 (저장 시 battery-YYYY-MM-DD 형식으로 저장)
        const fullDateKey = dateStr.startsWith('battery-') ? dateStr : `battery-${dateStr}`;
        const brief = await getBriefByDate(fullDateKey);

        if (brief) {
            return NextResponse.json({
                success: true,
                data: brief
            });
        } else {
            return NextResponse.json({
                success: false,
                error: '해당 날짜의 배터리 브리핑이 존재하지 않습니다.'
            });
        }

    } catch (error) {
        console.error('[Battery Brief API Error]', error);
        return NextResponse.json(
            { success: false, error: '배터리 브리핑 조회 중 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
