import { NextRequest, NextResponse } from 'next/server';
import { getBriefByDate, getLatestBrief, getAllBriefs, deleteBrief } from '@/lib/store';
import { getReportType, inferLegacyReportType } from '@/lib/report-type';

// 브리핑 조회 API
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');
        const list = searchParams.get('list');

        // 목록 조회
        if (list === 'true') {
            const includeIssues = searchParams.get('include_issues') === 'true';
            const allBriefs = await getAllBriefs(50);
            // AI 일일 브리프만 필터링
            const aiBriefs = allBriefs.filter(b => getReportType(b) === 'daily_brief');

            return NextResponse.json({
                success: true,
                data: aiBriefs.map(b => ({
                    id: b.id,
                    date: b.date,
                    dayOfWeek: b.dayOfWeek,
                    totalIssues: b.totalIssues,
                    generatedAt: b.generatedAt,
                    issues: includeIssues ? b.issues : undefined
                }))
            });
        }

        // 특정 날짜 조회
        if (date) {
            // AI API에서는 배터리 브리프 키를 조회할 수 없도록 차단 (요청 키는 레거시 키 스키마 → 헬퍼로 판별)
            if (inferLegacyReportType({ id: date }) === 'battery_daily_brief') {
                return NextResponse.json(
                    { success: false, error: '해당 데이터는 AI 브리핑이 아닙니다.' },
                    { status: 403 }
                );
            }

            const brief = await getBriefByDate(date);
            if (!brief) {
                return NextResponse.json(
                    { success: false, error: '해당 날짜의 브리핑이 없습니다.' },
                    { status: 404 }
                );
            }
            return NextResponse.json({ success: true, data: brief });
        }

        // 최신 브리핑 조회 (배터리 제외하고 AI 중 가장 최신 것 찾기)
        const all = await getAllBriefs(10);
        const latestAI = all.find(b => getReportType(b) === 'daily_brief');

        if (!latestAI) {
            return NextResponse.json(
                { success: false, error: '생성된 AI 브리핑이 없습니다.' },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true, data: latestAI });

    } catch (error) {
        console.error('[Brief API Error]', error);
        return NextResponse.json(
            { success: false, error: '브리핑 조회 중 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}

// 브리핑 삭제 API
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');

        if (!date) {
            return NextResponse.json(
                { success: false, error: '삭제할 날짜가 지정되지 않았습니다.' },
                { status: 400 }
            );
        }

        // 오늘 날짜 계산 (KST 기준)
        const nowDate = new Date();
        const todayStr = nowDate.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

        // 오늘 날짜가 아니면 삭제 거부
        if (date !== todayStr) {
            return NextResponse.json(
                { success: false, error: '오늘 이전의 브리핑은 삭제할 수 없습니다.' },
                { status: 403 }
            );
        }

        const success = await deleteBrief(date);

        if (success) {
            return NextResponse.json({ success: true, message: '브리핑이 삭제되었습니다.' });
        } else {
            return NextResponse.json(
                { success: false, error: '브리핑 삭제에 실패했습니다.' },
                { status: 500 }
            );
        }

    } catch (error) {
        console.error('[Brief Delete Error]', error);
        return NextResponse.json(
            { success: false, error: '브리핑 삭제 중 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
