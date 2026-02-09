import { NextResponse } from 'next/server';
import { getBriefByDate } from '@/lib/store';

// 배터리 브리프 조회 API
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get('date');

        // 날짜 파라미터가 없으면 오늘 날짜 사용 (KST)
        const nowDate = new Date();
        const dateStr = dateParam || nowDate.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

        // 배터리 브리프 조회 (저장 시 battery-YYYY-MM-DD 형식으로 저장)
        const brief = await getBriefByDate(`battery-${dateStr}`);

        if (brief) {
            return NextResponse.json({
                success: true,
                data: brief
            });
        } else {
            return NextResponse.json({
                success: false,
                error: '오늘의 배터리 브리핑이 아직 생성되지 않았습니다.'
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
