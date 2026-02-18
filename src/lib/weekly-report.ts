import { GoogleGenerativeAI } from '@google/generative-ai';
import { IssueItem } from '@/types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ─── Types ───────────────────────────────────────────────────────────────────
export interface IssueCluster {
    clusterName: string;
    themeDescription: string;
    issueIndices: number[];
}

// ─── 1. AI-Driven Issue Clustering ──────────────────────────────────────────
export async function clusterIssuesByAI(issues: IssueItem[]): Promise<IssueCluster[]> {
    if (issues.length === 0) return [];

    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    const issueList = issues.map((issue, idx) =>
        `[${idx}] ${issue.headline}\n    Facts: ${issue.keyFacts.slice(0, 2).join(' | ')}`
    ).join('\n');

    const prompt = `당신은 AI/테크 산업 이슈 분류 전문가입니다.
아래 ${issues.length}개의 뉴스 이슈를 분석하고, **주제적 관련성이 높은 이슈끼리 클러스터**로 묶어주세요.

## Rules
1. 각 클러스터는 최소 2개 이상의 이슈를 포함해야 합니다.
2. 단독 이슈(어떤 클러스터에도 속하지 않는 이슈)는 "기타 주요 동향" 클러스터에 묶으세요.
3. 클러스터는 최대 5개까지만 생성하세요.
4. 반드시 모든 이슈가 하나 이상의 클러스터에 포함되어야 합니다.
5. JSON만 출력하세요.

## Issues
${issueList}

## Output JSON Schema
\`\`\`json
{
  "clusters": [
    {
      "clusterName": "클러스터를 관통하는 주제명 (한글, 15자 이내)",
      "themeDescription": "이 클러스터의 핵심 테마를 한 문장으로 설명",
      "issueIndices": [0, 2, 5]
    }
  ]
}
\`\`\`

JSON만 출력하세요.`;

    try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Clustering JSON not found');

        const parsed = JSON.parse(jsonMatch[0]);
        const clusters: IssueCluster[] = parsed.clusters || [];

        // Validation: ensure all indices are within bounds
        return clusters.map(c => ({
            ...c,
            issueIndices: c.issueIndices.filter(i => i >= 0 && i < issues.length),
        })).filter(c => c.issueIndices.length >= 1);

    } catch (error) {
        console.error('[Weekly Report] Clustering failed:', error);
        // Fallback: single cluster with all issues
        return [{
            clusterName: '주간 종합 동향',
            themeDescription: '최근 7일간의 주요 동향 종합 분석',
            issueIndices: issues.map((_, i) => i),
        }];
    }
}

// ─── 2. Weekly Report Generation ────────────────────────────────────────────
export async function generateWeeklyReport(
    clusters: IssueCluster[],
    allIssues: IssueItem[],
    domain: 'ai' | 'battery' = 'ai'
): Promise<string | null> {

    const domainLabel = domain === 'ai' ? '글로벌 AI 산업' : '글로벌 배터리 산업';
    const nowDate = new Date();
    const kstDateStr = nowDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const weekAgo = new Date(nowDate);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const periodLabel = `${weekAgo.toLocaleDateString('ko-KR')} ~ ${nowDate.toLocaleDateString('ko-KR')}`;

    // Build cluster context
    const clusterContext = clusters.map((cluster, cIdx) => {
        const clusterIssues = cluster.issueIndices.map(i => allIssues[i]).filter(Boolean);
        const issueDetails = clusterIssues.map((issue, iIdx) => `
      [Issue ${iIdx + 1}] ${issue.headline}
      - Key Facts: ${issue.keyFacts.join(' / ')}
      - Insight: ${issue.insight}
      - Sources: ${issue.sources?.join(', ') || '없음'}`).join('\n');

        return `
### Cluster ${cIdx + 1}: ${cluster.clusterName}
테마: ${cluster.themeDescription}
포함 이슈 수: ${clusterIssues.length}건
${issueDetails}`;
    }).join('\n\n---\n');

    const systemPrompt = `# Antigravity Prompt — 주간 종합 심층 리포트 생성기

## Role
당신은 '${domainLabel} 트렌드센싱 보고서 작성자'이자 '전략 컨설턴트'입니다.
최근 1주일간 수집된 브리프 이슈들이 **주제별 클러스터**로 분류되어 제공됩니다.
이 클러스터들을 **상호 연결하고 종합적으로 분석**하여, 주간 심층 보고서를 작성해야 합니다.

## Critical Process (Research First)
**작성 전, 반드시 검색("googleSearch")을 수행하십시오.**
1. **Cross-Cluster Synthesis**: 클러스터 간 숨겨진 연결고리와 시너지를 파악하십시오.
2. **Trend Validation**: 각 클러스터의 트렌드가 실제로 진행 중인지 최신 데이터로 검증하십시오.
3. **Forward-Looking**: 단순 요약이 아닌, 향후 1~3개월 전망을 포함하십시오.

## Core Rules
1) **No Mock Data**: "추후 발표 예정", "다양한 기업들" 같은 모호한 표현 절대 금지. 실명, 수치, 날짜 명시.
2) **Source Extension**: 기존 브리프 소스 외에 **최소 3개 이상의 새로운 고품질 소스**를 검색하여 보강.
3) **Professional Tone**: 컨설팅 펌 보고서 톤 (~함, ~임 체).
4) **클러스터 간 크로스 분석**: 서로 다른 클러스터의 이슈가 어떻게 연결되는지 반드시 분석.

## Output Format
반드시 아래 포맷을 엄격히 준수하십시오. 마크다운 형식을 유지하십시오.

# [주간 트렌드 리포트] {전체 클러스터를 관통하는 핵심 주제 1줄}

분석대상: ${domainLabel}
타겟: CTO/CSO, 전략기획, 투자심사역
기간: ${periodLabel}
분석 범위: ${clusters.length}개 핵심 테마, ${allIssues.length}건 이슈 종합

## ■ Executive Summary
- **[Top Signal]** {이번 주 가장 중요한 신호}
- **[Mega Trend]** {클러스터들이 공통으로 가리키는 거시적 흐름}
- **[So What]** {한국 기업이 즉각 주목해야 할 시사점}

## ■ Cluster Analysis

(각 클러스터별로 아래 형식 반복)

### 🔹 {클러스터명}
**핵심 판단**: {이 클러스터의 핵심 메시지 1줄}

#### Key Developments
- (Fact) {검색된 구체적 사실 (수치, 날짜 필수)}
- (Analysis) {분석} (Basis: {근거})

#### Cross-Link
- {다른 클러스터와의 연결점 분석}

## ■ Cross-Cluster Insights
### [{클러스터 간 공통 테마 1}]
- (Driver) {이 테마를 이끄는 동인}
- (Convergence) {어떤 클러스터들이 여기서 만나는지}

## ■ Implications
- **[Market]** {시장 영향}
- **[Tech]** {기술 영향}
- **[Comp]** {경쟁 구도 변화}
- **[Policy]** {규제/정책 리스크}

## ■ Next Week Watchlist
- **{관측 지표/이벤트 1}**
  (Why) {왜 중요한지}
  (When) {일정/날짜}

## ■ Sources
(브리프 원본 소스 + 추가 리서치 소스)

## START
지금 즉시 검색을 시작하고, 확보된 팩트를 바탕으로 주간 종합 보고서를 작성하십시오.`;

    const model = genAI.getGenerativeModel({
        model: 'gemini-3-pro-preview',
        systemInstruction: systemPrompt,
        tools: [{ googleSearch: {} } as any],
    });

    const userPrompt = `
# 주간 리포트 생성 요청

## 분석 기간: ${periodLabel}
## 총 이슈 수: ${allIssues.length}건
## 클러스터 수: ${clusters.length}개

---
## 클러스터별 이슈 데이터

${clusterContext}

---
## TODAY_KST: ${kstDateStr}

위 클러스터 데이터를 기반으로 주간 종합 심층 리포트를 작성하십시오.
반드시 검색(googleSearch)을 먼저 수행한 후 작성하십시오.`;

    try {
        console.log(`[Weekly Report] 주간 리포트 생성 시작 (${clusters.length} clusters, ${allIssues.length} issues)...`);
        const result = await model.generateContent(userPrompt);
        const response = result.response;
        let text = response.text();

        // Extract new sources from grounding metadata
        const briefingSources = allIssues.flatMap(i => i.sources || []);
        const additionalSources: string[] = [];

        const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
        if (groundingMetadata?.groundingChunks) {
            groundingMetadata.groundingChunks.forEach((chunk: any) => {
                if (chunk.web?.url) {
                    const url = chunk.web.url;
                    if (!briefingSources.includes(url)) {
                        additionalSources.push(url);
                    }
                }
            });
        }

        // Build final sources section
        const combinedSourcesSet = new Set([...briefingSources, ...additionalSources]);
        const finalUniqueSources = Array.from(combinedSourcesSet);

        let newSourcesSection = '\n## ■ Sources\n';
        finalUniqueSources.forEach((url, idx) => {
            try {
                const urlObj = new URL(url);
                const hostname = urlObj.hostname.replace('www.', '');
                const label = briefingSources.includes(url) ? 'Brief Origin' : 'Deep Research';
                newSourcesSection += `- [${idx + 1}] ${hostname} | [${label}] ${url}\n`;
            } catch (e) {
                newSourcesSection += `- [${idx + 1}] Source | ${url}\n`;
            }
        });

        const expansionCount = finalUniqueSources.length - new Set(briefingSources).size;
        newSourcesSection += expansionCount > 0
            ? `\n(브리프 원본 소스 ${new Set(briefingSources).size}개를 기반으로, 추가 리서치를 통해 ${expansionCount}개의 신규 출처를 확보했습니다.)\n`
            : `\n(브리프 원본 소스를 기반으로 작성되었습니다.)\n`;

        const sourcesPattern = /## ■ Sources[\s\S]*$/i;
        const bodyContent = text.replace(sourcesPattern, '').trim();
        const finalReport = `${bodyContent}\n\n${newSourcesSection}`;

        console.log(`[Weekly Report] 생성 완료. Sources: brief(${new Set(briefingSources).size}) + new(${expansionCount})`);
        return finalReport;

    } catch (error) {
        console.error('[Weekly Report] Generation failed:', error);
        return null;
    }
}
