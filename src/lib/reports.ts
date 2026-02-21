import { GoogleGenerativeAI } from '@google/generative-ai';
import { IssueItem } from '@/types';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { getIssuesByDateRange } from './store';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export type ReportType = 'WEEKLY' | 'MONTHLY' | 'CUSTOM';

interface ManualSourceContent {
    url: string;
    title: string;
    content: string;
}

// 1. 수동 입력 소스 크롤링 및 파싱
export async function fetchContentFromUrls(urls: string[]): Promise<ManualSourceContent[]> {
    const results: ManualSourceContent[] = [];

    for (const url of urls) {
        if (!url) continue;
        try {
            console.log(`[Report] Fetching manual source: ${url}`);
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; AI-Brief-Bot/1.0)',
                },
                next: { revalidate: 3600 } // Cache for 1 hour
            });

            if (!response.ok) {
                console.warn(`[Report] Failed to fetch ${url}: ${response.status}`);
                continue;
            }

            const html = await response.text();
            const dom = new JSDOM(html, { url });
            const reader = new Readability(dom.window.document);
            const article = reader.parse();

            if (article) {
                results.push({
                    url,
                    title: article.title || 'Untitled Source',
                    content: article.textContent || '',
                });
            }
        } catch (error) {
            console.error(`[Report] Error fetching ${url}:`, error);
        }
    }

    return results;
}

// 2. 통합 리포트 생성 (Gemini 3 Pro 활용)
export async function generateAggregatedReport(
    issues: IssueItem[],
    manualSources: string[] = [],
    type: ReportType,
    periodLabel: string, // e.g., "2월 3주차", "2024년 2월"
    manualTexts: string[] = [] // 원문 붙여넣기 텍스트
): Promise<string> {

    // Manual Sources Fetching
    const manualContents = await fetchContentFromUrls(manualSources);

    // Prepare Prompt Context
    const issuesContext = issues.map((issue, idx) => `
    [Issue ${idx + 1}]
    Title: ${issue.headline}
    Key Facts:
    ${issue.keyFacts.map(f => `- ${f}`).join('\n')}
    Insight: ${issue.insight}
    Sources:
    ${issue.sources?.length ? issue.sources.map(s => `- ${s}`).join('\n') : '- (없음)'}
    `).join('\n\n');


    const manualContext = manualContents.map((src, idx) => `
    [Manual Source ${idx + 1}]
    Title: ${src.title}
    URL: ${src.url}
    Content Summary:
    ${src.content.substring(0, 2000)}... (truncated)
    `).join('\n\n');

    // 원문 붙여넣기 텍스트 컨텍스트
    const pastedTexts = manualTexts.filter(t => t.trim() !== '');
    const pastedTextContext = pastedTexts.map((text, idx) => `
    [Pasted Text ${idx + 1}]
    Content:
    ${text.substring(0, 3000)}${text.length > 3000 ? '... (truncated)' : ''}
    `).join('\n\n');

    const prompt = `
    당신은 세계 최고의 AI 산업 전략 분석가입니다.
    제공된 '브리프 이슈들'과 '추가 수집 자료(Manual Sources)', 그리고 '원문 텍스트(Pasted Texts)'를 바탕으로,
    **"${periodLabel} 종합 심층 리포트"**를 작성해주세요.

    ---
    ### 분석 대상 데이터
    1. **기존 브리프 이슈 (${issues.length}건)**:
    ${issuesContext}

    2. **추가 심층 자료 (${manualContents.length}건)**:
    ${manualContext}

    3. **원문 텍스트 (${pastedTexts.length}건)**:
    ${pastedTextContext || '(없음)'}

    ---
    ### Critical Rules
    1) 출력 포맷: 반드시 아래 "OUTPUT TEMPLATE" 그대로 작성.
    2) Action Item 금지: 행동 지시 문구 작성 금지.
    3) 사실 검증: 존재하지 않는 사실 창작 금지.
    4) 각 섹션 마커 ■ 기호를 반드시 포함.
    5) 톤앤매너: **모든 문장을 철저하게 명사형 종결어미(~함, ~임, ~전망 등)로 끝나는 짧은 '개조식 축약 문체'로 작성할 것. 긴 줄글(paragraph) 형태의 서술을 절대 금지하며, 하위 블릿(-)을 적극 활용하여 간결하게 작성할 것. 서술어(~습니다, ~한다) 절대 금지.**

    ========================================================
    ## OUTPUT TEMPLATE (이 형식 그대로 출력)

    # [트렌드 리포트] {이슈들을 관통하는 한 문장 제목}

    분석대상: {산업 세그먼트}
    타겟: {이해관계자 3종}
    기간: ${periodLabel}
    관점: {분석 프레임워크 기반 관점}

    ## ■ Executive Summary
    - **[Signal]** {핵심 신호 — 이슈들을 관통하는 가장 중요한 변화 신호}
    - **[Change]** {산업 구조 변화 — 이전과 달라진 점}
    - **[So What]** {전략적 함의 — 왜 주목해야 하는지}

    ## ■ Key Developments
    ### [{핵심 전개 1 제목}]
    - (Fact) {확정 사실}
    - (Analysis) {2~3개의 하위 블릿으로 개조식 분석} (Basis: {이론/근거} - {설명})

    ### [{핵심 전개 2 제목}]
    - (Fact) {확정 사실}
    - (Analysis) {2~3개의 하위 블릿으로 개조식 분석} (Basis: {이론/근거} - {설명})

    ## ■ Core Themes
    ### [{테마 1}]
    - (Driver) {메커니즘}

    ### [{테마 2}]
    - (Driver) {메커니즘}

    ## ■ Implications
    - **[Market]** {시장 관점}
    - **[Tech]** {기술 관점}
    - **[Comp]** {경쟁 관점}
    - **[Policy]** {규제 관점}

    ## ■ Risks & Uncertainties
    - **[tech]** {기술 리스크}
    - **[market]** {시장 리스크}
    - **[reg]** {규제 리스크}

    ## ■ Watchlist
    - **{관측 지표 1}**
    (Why) {중요성}
    (How) {모니터링 방법}

    ## ■ Sources
    (분석에 사용된 이슈 출처를 기반으로 작성)

    ## START
    즉시 리포트를 작성하라.
    `;


    try {
        // Try Gemini 3.1 Pro (Preview) first
        // Note: Using Gemini 3 models as per gemini.ts configuration
        let modelName = 'gemini-3.1-pro-preview';

        console.log(`[Report] Starting generation with model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = result.response;
        return response.text();

    } catch (error: any) {
        console.error('[Report] Generation failed with Pro model, trying Fallback:', error);
        // Fallback to Flash if Pro fails
        try {
            const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (fallbackError) {
            console.error('[Report] Fallback generation failed:', fallbackError);
            throw new Error('Failed to generate report.');
        }
    }
}
