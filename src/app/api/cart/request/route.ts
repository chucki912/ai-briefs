import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/store';
import { v4 as uuidv4 } from 'uuid';
import { generateAggregatedReport } from '@/lib/reports';

export const maxDuration = 60; // 60s for report generation

export async function POST(request: NextRequest) {
    const storage = getStorage();
    try {
        const body = await request.json();
        const { items, manualUrls, manualTexts, type = 'CUSTOM' } = body;

        const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
        const today = new Date().toISOString().split('T')[0];
        const limitKey = `usage_limit:${today}:${ip}`;

        // 1. 간단한 사용량 제한 체크 (하루 3회)
        const currentUsage = await storage.kvGet<number>(limitKey) || 0;
        if (currentUsage >= 3) {
            return NextResponse.json({
                error: '오늘의 리포트 생성 한도를 초과했습니다. (일일 최대 3회)',
                limitReached: true
            }, { status: 429 });
        }

        // 2. 요청 내역 로그 저장 (관리자용)
        const requestId = uuidv4();
        const cartRequest = {
            id: requestId,
            timestamp: Date.now(),
            ip,
            itemCount: items?.length || 0,
            manualUrlCount: manualUrls?.length || 0,
            manualTextCount: manualTexts?.length || 0,
            items: items?.map((i: any) => i.headline) || [],
        };

        // 로그 리스트에 추가 (최신 100건 유지)
        const requestList = await storage.kvGet<any[]>('cart_request_list') || [];
        requestList.unshift(cartRequest);
        await storage.kvSet('cart_request_list', requestList.slice(0, 100));

        // 3. 리포트 생성
        const periodLabel = `User Selection (${today})`;
        const report = await generateAggregatedReport(
            items || [],
            manualUrls || [],
            type,
            periodLabel,
            manualTexts || []
        );

        // 4. 사용량 증가
        await storage.kvSet(limitKey, currentUsage + 1, 86400); // 24시간 TTL

        return NextResponse.json({
            success: true,
            report,
            remainingUsage: 3 - (currentUsage + 1)
        });
    } catch (error: any) {
        console.error('[Cart Request API Error]', error);
        return NextResponse.json({
            error: '리포트 생성 중 오류가 발생했습니다.',
            details: error.message
        }, { status: 500 });
    }
}
