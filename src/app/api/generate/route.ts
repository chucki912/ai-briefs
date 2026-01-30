import { NextResponse } from 'next/server';
import { fetchAllNews } from '@/lib/collectors/news-fetcher';
import { analyzeNewsAndGenerateInsights } from '@/lib/gemini';
import { buildReport, buildEmptyReport } from '@/lib/generators/report-builder';
import { saveBrief, getBriefByDate } from '@/lib/database';

// 브리핑 생성 API
export async function POST() {
    try {
        console.log('[Generate] 브리핑 생성 시작...');

        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];

        // 이미 오늘 브리핑이 있는지 확인
        const existingBrief = await getBriefByDate(dateStr);
        if (existingBrief) {
            console.log('[Generate] 오늘 브리핑이 이미 존재합니다.');
            return NextResponse.json({
                success: true,
                data: existingBrief,
                message: '이미 생성된 브리핑이 있습니다.'
            });
        }

        // 1. 뉴스 수집
        console.log('[Generate] Step 1: 뉴스 수집 중...');
        const newsItems = await fetchAllNews();

        if (newsItems.length === 0) {
            console.log('[Generate] 수집된 뉴스가 없습니다.');
            const emptyReport = buildEmptyReport(today);
            await saveBrief(emptyReport);
            return NextResponse.json({
                success: true,
                data: emptyReport,
                message: '수집된 뉴스가 없습니다.'
            });
        }

        console.log(`[Generate] ${newsItems.length}개 뉴스 수집 완료`);

        // 2. 분석 및 인사이트 생성
        console.log('[Generate] Step 2: 분석 및 인사이트 생성 중...');
        const issues = await analyzeNewsAndGenerateInsights(newsItems);

        // 3. 리포트 생성
        console.log('[Generate] Step 3: 리포트 생성 중...');
        const report = buildReport(issues, today);

        // 4. 데이터베이스 저장
        console.log('[Generate] Step 4: 저장 중...');
        await saveBrief(report);

        console.log('[Generate] 브리핑 생성 완료!');

        return NextResponse.json({
            success: true,
            data: report,
            message: `${report.totalIssues}개 이슈 생성 완료`
        });

    } catch (error) {
        console.error('[Generate Error]', error);
        return NextResponse.json(
            { success: false, error: '브리핑 생성 중 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
