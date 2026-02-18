import { NextRequest, NextResponse } from 'next/server';
import { generateAggregatedReport, ReportType } from '@/lib/reports';
import { getIssuesByDateRange } from '@/lib/store';
import { IssueItem } from '@/types';

export const maxDuration = 60; // Allow 60 seconds for report generation

interface GenerateReportRequest {
    type: ReportType;
    selectionMethod: 'AUTO_DATE' | 'MANUAL_SELECTION' | 'MANUAL_ONLY';
    dateRange?: {
        startDate: string; // YYYY-MM-DD
        endDate: string;   // YYYY-MM-DD
    };
    selectedIssues?: IssueItem[];
    manualUrls?: string[];
    manualTexts?: string[];
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json() as GenerateReportRequest;
        const { type, selectionMethod, dateRange, selectedIssues, manualUrls, manualTexts } = body;

        let targetIssues: IssueItem[] = [];
        let periodLabel = '';

        // 1. 이슈 데이터 수집
        if (selectionMethod === 'MANUAL_SELECTION' && selectedIssues) {
            targetIssues = selectedIssues; // 프론트엔드에서 전달받은 이슈 사용
            periodLabel = 'Selected Issues';
        } else if (selectionMethod === 'AUTO_DATE' && dateRange) {
            const start = new Date(dateRange.startDate);
            const end = new Date(dateRange.endDate);
            targetIssues = await getIssuesByDateRange(start, end);
            periodLabel = `${dateRange.startDate} ~ ${dateRange.endDate}`;
        } else if (selectionMethod === 'MANUAL_ONLY') {
            targetIssues = [];
            periodLabel = 'Manual Sources Analysis';
        }

        // 2. 리포트 생성
        // manualUrls가 있으면 포함해서 분석
        const markdownReport = await generateAggregatedReport(
            targetIssues,
            manualUrls || [],
            type,
            periodLabel,
            manualTexts || []
        );

        return NextResponse.json({ report: markdownReport });

    } catch (error: any) {
        console.error('[API] Report generation failed:', error);
        return NextResponse.json(
            { error: 'Failed to generate report', details: error.message },
            { status: 500 }
        );
    }
}
