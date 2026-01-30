import { NextRequest, NextResponse } from 'next/server';
import { getBriefByDate, getLatestBrief, getAllBriefs } from '@/lib/store';

// 브리핑 조회 API
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');
        const list = searchParams.get('list');

        // 목록 조회
        if (list === 'true') {
            const briefs = await getAllBriefs(30);
            return NextResponse.json({
                success: true,
                data: briefs.map(b => ({
                    id: b.id,
                    date: b.date,
                    dayOfWeek: b.dayOfWeek,
                    totalIssues: b.totalIssues,
                    generatedAt: b.generatedAt
                }))
            });
        }

        // 특정 날짜 조회
        if (date) {
            const brief = await getBriefByDate(date);
            if (!brief) {
                return NextResponse.json(
                    { success: false, error: '해당 날짜의 브리핑이 없습니다.' },
                    { status: 404 }
                );
            }
            return NextResponse.json({ success: true, data: brief });
        }

        // 최신 브리핑 조회
        const latest = await getLatestBrief();
        if (!latest) {
            return NextResponse.json(
                { success: false, error: '생성된 브리핑이 없습니다.' },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true, data: latest });

    } catch (error) {
        console.error('[Brief API Error]', error);
        return NextResponse.json(
            { success: false, error: '브리핑 조회 중 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
