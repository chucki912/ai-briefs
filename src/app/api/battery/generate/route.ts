import { NextResponse } from 'next/server';
import { fetchBatteryNews } from '@/lib/collectors/battery-news-fetcher';
import { analyzeBatteryNewsAndGenerateInsights } from '@/lib/battery-gemini';
import { saveBrief, getBriefByDate } from '@/lib/store';
import { BriefReport, IssueItem } from '@/types';

// Helper: Markdown 생성
function buildBatteryMarkdown(issues: IssueItem[], dateStr: string): string {
    let md = `# 🔋 Battery Daily Brief - ${dateStr}\n\n`;

    issues.forEach((issue, idx) => {
        md += `## Issue ${idx + 1}. ${issue.headline}\n\n`;
        issue.keyFacts.forEach(fact => {
            md += `• ${fact}\n`;
        });
        md += `\n**Insight:** ${issue.insight}\n\n`;
        md += `**Sources:**\n`;
        issue.sources.forEach(url => {
            md += `- ${url}\n`;
        });
        md += '\n---\n\n';
    });

    return md;
}

// 배터리 브리핑 생성 API (Vercel Cron 지원을 위해 GET 추가)
export async function GET(request: Request) {
    return handleBatteryGenerate(request);
}

export async function POST(request: Request) {
    return handleBatteryGenerate(request);
}

async function handleBatteryGenerate(request: Request) {
    try {
        // 보안: Vercel Cron Secret 확인 (설정된 경우)
        const authHeader = request.headers.get('authorization');
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        console.log('[Battery Generate] 배터리 브리핑 생성 시작...');

        const nowDate = new Date();
        // SV-SE locale with Asia/Seoul timezone gives YYYY-MM-DD in KST
        const dateStr = nowDate.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

        // KST 기준 요일 및 표시용 날짜
        const kstFormatter = new Intl.DateTimeFormat('ko-KR', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'short'
        });
        const parts = kstFormatter.formatToParts(nowDate);
        const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';

        const kstDisplayDate = `${getPart('year')} ${getPart('month')} ${getPart('day')}`;
        const kstDayOfWeek = getPart('weekday');

        // 배터리 브리프용 키 (날짜 앞에 battery- 접두사)
        const batteryDateKey = `battery-${dateStr}`;

        // GET 요청 시 body가 없을 수 있으므로 처리
        const body = await request.json().catch(() => ({}));
        const force = body.force === true;

        // 이미 오늘 브리핑이 있는지 확인 (force가 아닐 때만)
        if (!force) {
            const existingBrief = await getBriefByDate(batteryDateKey);
            if (existingBrief) {
                console.log('[Battery Generate] 오늘 배터리 브리핑이 이미 존재합니다.');
                return NextResponse.json({
                    success: true,
                    data: existingBrief,
                    message: '이미 생성된 배터리 브리핑이 있습니다.'
                });
            }
        }

        // 1. 배터리 뉴스 수집
        console.log('[Battery Generate] Step 1: 배터리 뉴스 수집 중...');
        const newsItems = await fetchBatteryNews();

        if (newsItems.length === 0) {
            console.log('[Battery Generate] 수집된 배터리 뉴스가 없습니다.');
            const emptyReport: BriefReport = {
                id: batteryDateKey,
                date: batteryDateKey,
                dayOfWeek: kstDayOfWeek,
                generatedAt: nowDate.toISOString(),
                totalIssues: 0,
                issues: [],
                markdown: `# 🔋 Battery Daily Brief - ${kstDisplayDate}\n\n수집된 배터리 뉴스가 없습니다.`,
                reportType: 'battery_daily_brief',
            };
            await saveBrief(emptyReport);
            return NextResponse.json({
                success: true,
                data: emptyReport,
                message: '수집된 배터리 뉴스가 없습니다.'
            });
        }

        console.log(`[Battery Generate] ${newsItems.length}개 배터리 뉴스 수집 완료`);

        // 2. 분석 및 인사이트 생성
        console.log('[Battery Generate] Step 2: K-Battery 관점 분석 중...');
        const issues = await analyzeBatteryNewsAndGenerateInsights(newsItems);

        // 3. 리포트 생성
        console.log('[Battery Generate] Step 3: 리포트 생성 중...');
        const report: BriefReport = {
            id: batteryDateKey,
            date: batteryDateKey,
            dayOfWeek: kstDayOfWeek,
            generatedAt: nowDate.toISOString(), // 실제 생성 시간을 UTC ISO 형식으로 저장 (UI에서 현지 시간으로 변환)
            totalIssues: issues.length,
            issues: issues,
            markdown: buildBatteryMarkdown(issues, kstDisplayDate),
            reportType: 'battery_daily_brief',
        };

        // 4. 데이터베이스 저장
        console.log('[Battery Generate] Step 4: 저장 중...');
        await saveBrief(report);

        console.log('[Battery Generate] 배터리 브리핑 생성 완료!');

        return NextResponse.json({
            success: true,
            data: report,
            message: `${report.totalIssues}개 배터리 이슈 생성 완료`
        });

    } catch (error) {
        console.error('[Battery Generate Error]', error);
        return NextResponse.json(
            { success: false, error: '배터리 브리핑 생성 중 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
