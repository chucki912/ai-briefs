import { GoogleGenerativeAI } from '@google/generative-ai';
import { NewsItem, IssueItem } from '@/types';
import { matchFrameworks, getFrameworkNames } from './analyzers/framework-matcher';

// Gemini API 클라이언트 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// 뉴스 분석 및 인사이트 생성
export async function analyzeNewsAndGenerateInsights(
    newsItems: NewsItem[]
): Promise<IssueItem[]> {
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    // 뉴스를 관련 주제별로 클러스터링
    const clusters = clusterNewsByTopic(newsItems);

    const issues: IssueItem[] = [];

    // 최대 5개 이슈만 생성
    const topClusters = clusters.slice(0, 5);

    for (const cluster of topClusters) {
        try {
            const issue = await generateIssueFromCluster(model, cluster);
            if (issue) {
                issues.push(issue);
            }
        } catch (error) {
            console.error('[Gemini Error]', error);
        }
    }

    return issues;
}

// 주제별 뉴스 클러스터링
function clusterNewsByTopic(newsItems: NewsItem[]): NewsItem[][] {
    const clusters = new Map<string, NewsItem[]>();

    for (const item of newsItems) {
        const keyTerms = [
            // 초거대 모델/기업
            'OpenAI', 'Anthropic', 'Google', 'Meta', 'Microsoft', 'NVIDIA', 'Apple AI', 'xAI', 'Mistral',
            // 주요 모델/기술
            'GPT', 'Claude', 'Gemini', 'Llama', 'Sora', 'Reasoning', 'o1', 'o3',
            // 산업/응용
            'Agent', 'Robot', 'Physical Intelligence', 'Quantum', 'Semiconductor', 'HBM',
            // 규제/윤리
            'Regulation', 'Safety', 'Copyright', 'Policy', 'Lawsuit'
        ];

        let cluster = 'Global Trends';
        const titleAndDesc = (item.title + ' ' + item.description).toLowerCase();

        for (const term of keyTerms) {
            if (titleAndDesc.includes(term.toLowerCase())) {
                cluster = term;
                break;
            }
        }

        if (!clusters.has(cluster)) {
            clusters.set(cluster, []);
        }
        clusters.get(cluster)!.push(item);
    }

    // 크기순 및 중요 키워드 우선 정렬
    return Array.from(clusters.values())
        .sort((a, b) => b.length - a.length);
}

// 클러스터에서 이슈 생성
async function generateIssueFromCluster(
    model: ReturnType<typeof genAI.getGenerativeModel>,
    cluster: NewsItem[]
): Promise<IssueItem | null> {
    const primaryNews = cluster[0];
    const frameworks = matchFrameworks(primaryNews.title, primaryNews.description);

    // 뉴스 리스트에 인덱스 부여
    const indexedNews = cluster.map((n, i) => `[${i + 1}] 제목: ${n.title}\n출처: ${n.url}`).join('\n\n');

    const prompt = `당신은 **글로벌 AI 산업 전략 애널리스트**입니다. 아래 제공된 뉴스 클러스터를 분석하여 한국어 브리핑을 작성해주세요.

## 뉴스 클러스터 정보 (인덱스 부여됨)
${indexedNews}

## 분석 프레임워크
${getFrameworkNames(frameworks)}

## 작성 지침
1. **분석 대상**: 제공된 뉴스 기사들의 내용을 종합적으로 분석하세요.
2. **핵심 내용 (Key Facts)**:
   - 뉴스 클러스터에서 가장 중요한 사실을 **최대 3개**까지 추출하세요.
   - 각 항목은 구체적인 수치, 기업명, 제품명 등을 포함해야 합니다.
   - 문장은 간결하고 명확하게 작성하세요.
3. **전략적 인사이트 (Strategic Insight)**:
   - **단일 주제 집중 (Strictly Single Topic)**: 하나의 브리프 카드는 반드시 하나의 구체적이고 명확한 주제만 다루어야 합니다. 서로 다른 여러 소식을 병렬로 나열하지 마세요.
   - **So What? (한국 AI 산업 관점)**: 추출된 3가지 사실이 **한국 AI 기업(Naver, Kakao, SKT, LG AI 연구원, LG CNS, AI 스타트업 등)**이나 국내 산업 생태계에 어떤 기회나 위협이 되는지 구체적으로 분석하세요. 단순 요약이 아닌, 파급 효과와 대응 전략을 포함해야 합니다.
   - 전문가 수준의 통찰력을 보여주어야 합니다.
4. **연관 키워드**: 이 이슈와 관련된 핵심 키워드를 해시태그 형태로 3개 추출하세요.
5. **JSON 포맷**: 결과는 반드시 아래 JSON 스키마를 따라야 합니다.

## JSON 스키마
\`\`\`json
{
  "title": "이슈를 관통하는 핵심 제목 (50자 이내, 단일 핵심 주제 중심)",
  "category": "적절한 카테고리 (예: Tech Giant, Regulation, Model, Hardware, Industry 과 같은 영어 카테고리)",
  "koreanCategory": "한국어 카테고리 (예: 빅테크 동향, 규제 및 정책, AI 모델, 하드웨어, 산업 동향)",
  "oneLineSummary": "이슈 전체를 요약하는 한 문장 (100자 이내)",
  "keyFacts": [
    "핵심 사실 1",
    "핵심 사실 2",
    "핵심 사실 3"
  ],
  "strategicInsight": "3가지 핵심 사실을 종합하여 도출한 심층적인 전략적 인사이트 (300자 내외) - 한국 AI 산업에 미치는 영향(So What?) 필수 포함",
  "hashtags": ["#키워드1", "#키워드2", "#키워드3"],
  "relatedStocks": [
    {"name": "연관 종목명", "reason": "연관 이유 (간략히)"}
  ],
  "relevantSourceIndices": [1, 2]
}
\`\`\`
- 감정적 표현 배제, 건조하고 전문적인 분석 톤

JSON만 출력하세요.`;

    try {
        const result = await generateWithRetry(model, prompt);
        const response = await result.response;
        const text = response.text();

        // JSON 추출
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('JSON not found in response');
        }

        const parsed = JSON.parse(jsonMatch[0]);

        // 1차 필터링: Gemini가 선택한 인덱스 사용
        let selectedSources: string[] = [];
        if (parsed.relevantSourceIndices && Array.isArray(parsed.relevantSourceIndices)) {
            selectedSources = parsed.relevantSourceIndices
                .map((idx: number) => cluster[idx - 1]?.url)
                .filter((url: string) => url !== undefined);
        }

        // 2차 필터링 (강제): 헤드라인 키워드 기반 코드 레벨 검증
        const headline = parsed.title;
        const headlineKeywords = headline.split(' ').filter((w: string) => w.length > 1);

        const finalSources = (selectedSources.length > 0 ? selectedSources : cluster.map(c => c.url))
            .filter((url, index) => {
                const newsItem = cluster.find(c => c.url === url);
                if (!newsItem) return false;

                const content = (newsItem.title + ' ' + (newsItem.description || '')).toLowerCase();
                const score = headlineKeywords.reduce((acc: number, kw: string) => {
                    return acc + (content.includes(kw.toLowerCase()) ? 1 : 0);
                }, 0);

                return index === 0 || score > 0;
            });

        return {
            headline: parsed.title,
            keyFacts: parsed.keyFacts,
            insight: parsed.strategicInsight,
            framework: getFrameworkNames(frameworks),
            sources: finalSources.length > 0 ? finalSources : [cluster[0].url],
        };
    } catch (error) {
        console.error('[Issue Generation Error]', error);
        return null;
    }
}

// API 연결 테스트
export async function testGeminiConnection(): Promise<boolean> {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
        const result = await model.generateContent('Hello');
        const response = await result.response;
        return !!response.text();
    } catch (error) {
        console.error('[Gemini Connection Test Failed]', error);
        return false;
    }
}

// 트렌드 센싱 리포트 (Deep Dive) 생성
export async function generateTrendReport(
    issue: IssueItem,
    context: string // Kept for compatibility
): Promise<string | null> {
    // Updated System Prompt for Source Consistency & Expansion
    const systemPrompt = `# Antigravity Prompt — 상세 리포트 생성기 (Source Expansion Edition)

## Role
당신은 ‘글로벌 AI 산업 트렌드센싱 리포트 작성자’이자 ‘전략 컨설턴트’입니다.
브리프(단신)의 정보를 기반으로 더 깊이 있는 "심층 분석"을 수행합니다.

## 핵심 목표: 소스 일관성 및 확장 (Critical)
1) **소스 상속**: 입력된 'ISSUE_URLS'는 이미 검증된 브리프의 원본 소스들입니다. 이들은 리포트의 기반이며, 모든 분석의 출발점이 되어야 합니다.
2) **소스 확장**: 당신은 상세 리포트 작성자로서 전문가적인 깊이를 더하기 위해, 제공된 소스 외에 **최소 1~2개 이상의 새로운 고품질 소스**를 스스로 검색하여 추가해야 합니다.
3) **검색 활용**: 'googleSearch', 'Brave Search', 'Tavily' 도구를 적극적으로 사용하여 기술적 상세 내용, 시장 데이터, 또는 경쟁사의 반응 등을 찾아 리포트를 보완하십시오.

## Critical Rules
1) 출력 포맷: 반드시 아래 “OUTPUT TEMPLATE” 그대로 작성.
2) Action Item 금지: 행동 지시 문구 작성 금지.
3) 사실 검증: 존재하지 않는 사실 창작 금지.
4) 소스 섹션 작성 방식:
   - **Sources 섹션 작성 금지**: 최종 소스 리스트는 시스템이 원본과 검색 결과를 합쳐서 자동으로 생성합니다. 리포트 끝에 절대로 URL을 직접 적지 마십시오.

========================================================
## OUTPUT TEMPLATE (이 형식 그대로 출력)

# [트렌드 리포트] {이슈를 한 문장으로 요약한 제목}

분석대상: {산업 세그먼트}
타겟: {이해관계자 3종}
기간: {날짜 범위}
관점: {분석 프레임워크 기반 관점}

## ■ Executive Summary
- **[Signal]** {핵심 신호}
- **[Change]** {산업 구조 변화}
- **[So What]** {전략적 함의}

## ■ Key Developments
### [{핵심 전개 1}]
- (Fact) {확정 사실 1}
- (Analysis) {분석} (Basis: {이론} - {설명})

## ■ Core Themes
### [{테마 1}]
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
(시스템이 브리프 소스 ${issue.sources ? issue.sources.length : 0}개에 당신이 추가한 신규 소스를 더하여 주입합니다.)

## START
즉시 리포트를 작성하라.`;

    const model = genAI.getGenerativeModel({
        model: 'gemini-3-pro-preview',
        systemInstruction: systemPrompt,
        tools: [{ googleSearch: {} } as any],
    });

    const nowDate = new Date();
    const kstDateStr = nowDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

    const userPrompt = `
# INPUTS
- ISSUE_TITLE: ${issue.headline}
- ISSUE_BULLETS: ${issue.keyFacts.join(', ')}
- ISSUE_URLS:
${issue.sources ? issue.sources.join('\n') : 'URL 없음'}
- TODAY_KST: ${kstDateStr}`;

    try {
        console.log('[Trend API] 상세 리포트 생성 시작 (Pro 모델 / 소스 확장 로직)...');
        const result = await generateWithRetry(model, userPrompt);
        const response = await result.response;
        let text = response.text();

        // 소스 일관성 및 강화 로직
        const briefingSources = issue.sources || [];
        const additionalSources: string[] = [];

        // Grounding Metadata에서 신규 소스 추출
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

        // 최종 소스 결합
        const combinedSourcesSet = new Set([...briefingSources, ...additionalSources]);
        const finalUniqueSources = Array.from(combinedSourcesSet);

        // 소스 섹션 렌더링
        let newSourcesSection = '\n## ■ Sources\n';
        finalUniqueSources.forEach((url, idx) => {
            try {
                const urlObj = new URL(url);
                const hostname = urlObj.hostname.replace('www.', '');
                const label = briefingSources.includes(url) ? 'Brief Origin' : 'Deep Research';
                newSourcesSection += `- [${idx + 1}] ${hostname} | ${kstDateStr.split(' ')[0]} | [${label}] ${url}\n`;
            } catch (e) {
                newSourcesSection += `- [${idx + 1}] Source | ${kstDateStr.split(' ')[0]} | ${url}\n`;
            }
        });

        const expansionCount = finalUniqueSources.length - briefingSources.length;
        newSourcesSection += expansionCount > 0
            ? `\n(브리프 소스 ${briefingSources.length}개를 모두 상속하였으며, 추가 연구를 통해 ${expansionCount}개의 신규 출처를 확보했습니다.)\n`
            : `\n(브리프 작성에 사용된 모든 원본 소스 ${briefingSources.length}개를 기반으로 작성되었습니다.)\n`;

        const sourcesPattern = /## ■ Sources[\s\S]*$/i;
        const bodyContent = text.replace(sourcesPattern, '').trim();

        const finalReport = `${bodyContent}\n\n${newSourcesSection}`;

        console.log(`[Trend API] 소스 검증 완료: 브리프(${briefingSources.length}) -> 리포트(${finalUniqueSources.length})`);

        return finalReport;
    } catch (error) {
        console.error('[Trend Report Error]', error);
        return null;
    }
}

// Helper: Retry logic for API calls
async function generateWithRetry(model: any, prompt: string | any, retries = 3, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await model.generateContent(prompt);
        } catch (error: any) {
            const isOverloaded = error.status === 503 || error.message?.includes('overloaded');
            const isRateLimit = error.status === 429 || error.message?.includes('RESOURCE_EXHAUSTED');

            if ((isOverloaded || isRateLimit) && i < retries - 1) {
                console.warn(`[Gemini Retry] Attempt ${i + 1} failed. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
                continue;
            }
            throw error;
        }
    }
}
