import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { BriefReport, IssueItem } from '@/types';

// 요일 매핑
const DAY_OF_WEEK: Record<number, string> = {
    0: '일요일',
    1: '월요일',
    2: '화요일',
    3: '수요일',
    4: '목요일',
    5: '금요일',
    6: '토요일',
};

// 브리핑 리포트 생성
export function buildReport(issues: IssueItem[], date: Date = new Date()): BriefReport {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayOfWeek = DAY_OF_WEEK[date.getDay()];

    // 마크다운 생성
    const markdown = generateMarkdown(issues, date, dayOfWeek);

    return {
        id: `brief-${dateStr}`,
        date: dateStr,
        dayOfWeek,
        issues,
        totalIssues: issues.length,
        generatedAt: new Date().toISOString(),
        markdown,
    };
}

// 마크다운 리포트 생성
function generateMarkdown(issues: IssueItem[], date: Date, dayOfWeek: string): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    let md = `================================================================================
${year}년 ${month}월 ${day}일 (${dayOfWeek})
<LLM이 찾아주는 데일리 AI 이슈 by Chuck Choi>
================================================================================

`;

    if (issues.length === 0) {
        md += `금일 수집된 주요 이슈가 없습니다.

`;
    } else {
        issues.forEach((issue, index) => {
            md += `이슈 ${index + 1}. ${issue.headline}
`;

            for (const fact of issue.keyFacts) {
                md += `- ${fact}
`;
            }

            md += `Insight: ${issue.insight}
원문:
`;

            for (const source of issue.sources) {
                md += `${source}
`;
            }

            md += `
`;
        });
    }

    md += `================================================================================
[총 ${issues.length}개 이슈 | 분석 기준일: ${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}]
================================================================================`;

    return md;
}

// 빈 리포트 생성 (수집 실패 시)
export function buildEmptyReport(date: Date = new Date()): BriefReport {
    return buildReport([], date);
}
