import { GoogleGenerativeAI } from '@google/generative-ai';
import { NewsItem, IssueItem } from '@/types';
import { matchFrameworks, getFrameworkNames } from './analyzers/framework-matcher';
import { getRecentIssues } from './store';

// Gemini API 클라이언트 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// 뉴스 분석 및 인사이트 생성
export async function analyzeNewsAndGenerateInsights(
    newsItems: NewsItem[]
): Promise<IssueItem[]> {
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    // 뉴스를 관련 주제별로 클러스터링
    const clusters = clusterNewsByTopic(newsItems);

    // 중복 방지를 위한 최근 이슈 조회 (지난 3일치)
    const recentIssues = await getRecentIssues(3);
    console.log(`[Deduplication] Loaded ${recentIssues.length} recent issues for comparison.`);

    const issues: IssueItem[] = [];

    // 최대 5개 이슈만 생성
    const topClusters = clusters.slice(0, 5);

    for (const cluster of topClusters) {
        try {
            // 중복 체크 1단계: 헤드라인 유사도 (빠른 필터링)
            const clusterHeadline = cluster[0].title;
            const isPotentialDupe = recentIssues.some(issue =>
                calculateSimilarity(issue.headline, clusterHeadline) > 0.6
            );

            if (isPotentialDupe) {
                console.log(`[Deduplication] Skipping likely duplicate cluster: ${clusterHeadline}`);
                continue;
            }

            const issue = await generateIssueFromCluster(model, cluster);
            if (issue) {
                // 중복 체크 2단계: 생성된 이슈 내용 기반 정밀 체크 (AI 활용 가능하나 비용 절감 위해 키워드/소스 매칭 사용)
                const isDuplicate = await checkDuplicateIssues(issue, recentIssues);
                if (isDuplicate) {
                    console.log(`[Deduplication] Discarded duplicate issue: ${issue.headline}`);
                    continue;
                }
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
- **단일 사건 집중 원칙**: 제공된 뉴스 클러스터 안에서 **가장 중요하고 시급한 단 하나의 사건(Single Event)**을 선정하세요. 나머지 관련성이 낮은 기사는 과감히 무시하십시오. Key Facts 3가지는 모두 **동일한 하나의 사건**에 대한 세부 내용이어야 합니다.

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

// 중복 이슈 체크 로직
export async function checkDuplicateIssues(newIssue: IssueItem, history: IssueItem[]): Promise<boolean> {
    if (history.length === 0) return false;

    // 1. 소스 URL 중복 체크 (가장 확실함)
    // 새로운 이슈의 소스가 기존 이슈의 소스와 50% 이상 겹치면 중복
    const newSources = new Set(newIssue.sources || []);

    for (const oldIssue of history) {
        const oldSources = new Set(oldIssue.sources || []);
        if (newSources.size === 0 || oldSources.size === 0) continue;

        const intersection = [...newSources].filter(x => oldSources.has(x));
        const overlapRatio = intersection.length / Math.min(newSources.size, oldSources.size);

        if (overlapRatio >= 0.5) {
            console.log(`[Deduplication] Source overlap ${Math.round(overlapRatio * 100)}% with "${oldIssue.headline}"`);
            return true;
        }

        // 2. 헤드라인 유사도 체크 (Jaccard Similarity of keywords)
        const sim = calculateSimilarity(newIssue.headline, oldIssue.headline);
        if (sim > 0.7) {
            console.log(`[Deduplication] Headline similarity ${sim.toFixed(2)} with "${oldIssue.headline}"`);
            return true;
        }

        // 3. AI Semantic Check (Fallback for semantic duplicates)
        // 키워드 유사도가 낮아도(0.2~0.7) 의미적으로 동일할 수 있음 (예: "Stock Hits High" vs "Shares Record")
        if (sim > 0.2) {
            const isSemanticDupe = await checkSemanticDuplicate(newIssue, oldIssue);
            if (isSemanticDupe) return true;
        }
    }
    return false;
}

// 3. AI 기반 의미론적 유사도 체크 (키워드 매칭이 애매한 경우)
async function checkSemanticDuplicate(newIssue: IssueItem, oldIssue: IssueItem): Promise<boolean> {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
        const prompt = `
        Compare these two news issues and determine if they describe the exact same core event or announcement. 
        Ignore minor differences in details or perspective.

        Issue A: "${newIssue.headline}"
        Key Facts A: ${newIssue.keyFacts.join(', ')}
        
        Issue B: "${oldIssue.headline}"
        Key Facts B: ${oldIssue.keyFacts.join(', ')}
        
        Are they referring to the same event? Answer strictly with "YES" or "NO".
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim().toUpperCase();

        if (text.includes("YES")) {
            console.log(`[Deduplication] AI Semantic Match: "${newIssue.headline}" == "${oldIssue.headline}"`);
            return true;
        }
        return false;
    } catch (e) {
        console.error("Semantic check failed", e);
        return false;
    }
}

// 간단한 키워드 기반 유사도 (Jaccard Similarity)
export function calculateSimilarity(str1: string, str2: string): number {
    const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s가-힣]/g, '').split(/\s+/).filter(w => w.length > 1);
    const set1 = new Set(normalize(str1));
    const set2 = new Set(normalize(str2));

    if (set1.size === 0 || set2.size === 0) return 0;

    const intersection = [...set1].filter(x => set2.has(x));
    return intersection.length / (set1.size + set2.size - intersection.length); // Jaccard Index
}

// API 연결 테스트 function
export async function checkGeminiConnection(): Promise<boolean> {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
        const result = await model.generateContent('Hello');
        const response = await result.response;
        console.log('[Gemini Connection Test Success]:', response.text().slice(0, 20) + '...');
        return true;
    } catch (error) {
        console.error('[Gemini Connection Test Failed]', error);
        return false;
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
    // Upgraded System Prompt: Super Intelligence Expert Edition
    const systemPrompt = `# Antigravity Prompt — AI 심층 전략 리포트 (Super Intelligence Expert Edition)

## Role
당신은 20년 경력의 '글로벌 AI 산업 전략 컨설턴트'이자 '산업 분석 전문가'입니다.
제공된 브리프(단신) 이슈를 기점으로 하여, 그 이면의 구조적 변화와 파급 효과를 끝까지 파고드는 **'Deep Dive'** 리포트를 작성하는 것이 당신의 핵심 임무입니다.
브리프의 맥락을 100% 상속하되, 검색을 통해 정보의 깊이와 외연을 확장하여 의사결정자에게 전략적 행동을 제시하십시오.

## Critical Process: Triple-Search Heuristics
**작성 전, 반드시 아래 3가지 의도를 가지고 검색("googleSearch")을 수행하십시오.**
1. **[Fact Check & Expansion]**: 브리프 내용을 최신 데이터로 갱신하고, 구체적 스펙·출시일·시장 데이터를 확보하십시오.
2. **[Anti-Thesis Search]**: 이 이슈의 반론, 기술적 한계, 회의적 시각을 검색하여 균형 잡힌 분석을 확보하십시오.
3. **[Value Chain Impact]**: 이 이슈가 상류(연구/학계)→중류(플랫폼/인프라)→하류(SaaS/최종 사용자)에 걸쳐 미치는 파급 효과를 검색하십시오.

## Core Rules
1) **No Mock Data**: "추후 발표 예정", "다양한 기업들" 같은 모호한 표현 절대 금지. 실명, 구체적 수치($, %, 날짜), 공식 발언만 사용.
2) **Source Extension**: ISSUE_URLS는 출발점. 최소 3개 이상의 새로운 고품질 글로벌 소스를 추가하여 분석의 객관성 확보.
3) **Professional Tone**: 컨설팅 펌 보고서 톤 (~함, ~임 체 사용).
4) **Label Precision**: 아래 Output Format의 대괄호 [] 안 레이블은 절대 변경·축약 금지. 정확히 그대로 출력할 것.
5) **No Empty Sections**: 모든 ## ■ 섹션에 반드시 실질적 내용을 포함할 것. 빈 섹션은 절대 금지.
6) **Minimum Depth**: [Analysis] 태그 뒤에는 반드시 최소 3문장 이상의 분석 본문을 작성하고, (Basis: 근거)를 명시할 것.

## Output Format
반드시 아래 포맷을 엄격히 준수하십시오.
꺾쇠 < > 안의 지시문은 당신이 실제 내용으로 치환해야 할 부분입니다.
대괄호 [ ] 안의 레이블은 그대로 유지하십시오.

# 브리프 심층 리포트: <이슈를 관통하는 제목>

분석대상: <구체적 대상 (기업명, 기술명 등)>
타겟: CEO/CTO, 전략기획 총괄
기간: <분석 기준일> 기준 향후 6~12개월 전망
관점: <Technology / Market / Geopolitics 중 택 1>

## ■ Executive Summary
- **[Signal]** <이 이슈가 보내는 핵심 신호 — 구체적 데이터 포함>
- **[Change]** <이로 인해 변경되는 산업 지형도>
- **[So What]** <한국 기업이 즉각 주목해야 할 시사점과 행동 제언>

## ■ Key Developments (Deep Dive)
### <구체적 사건/발표명 1>
- [Fact] <검색된 구체적 사실 (수치, 날짜, 기업명 필수)>
- [Analysis] <이 사건이 산업 구조에 미치는 영향을 최소 3문장 이상 분석> (Basis: <사용한 분석 프레임워크 또는 유사 사례>)

### <구체적 사건/발표명 2>
- [Fact] <검색된 구체적 사실>
- [Analysis] <분석 내용 최소 3문장 이상> (Basis: <근거>)

## ■ Core Themes
### <테마명>
- **[Driver]** <이 테마를 이끄는 핵심 동인>
- **[Context]** <배경 설명 및 연관 기업 동향>

## ■ Implications
- [Market] <시장 규모, CapEx, 비즈니스 모델 영향 — 수치 포함>
- [Tech] <기술적 돌파구 또는 병목점>
- [Comp] <경쟁사(Google, OpenAI, MS, Meta 등)의 대응 현황>
- [Policy] <관련 규제, 법적 리스크, 정책 동향>

## ■ Risks & Uncertainties
- **[TECH]** <기술적 리스크>
  - Impact: <예상되는 부정적 영향>
- **[MARKET]** <시장 리스크>
  - Impact: <예상되는 부정적 영향>

## ■ Watchlist
- **<지표/이벤트 명 1>**
  (Why) <이것이 왜 중요한 선행 트리거인지>
  (How) <무엇을 어떻게 모니터링해야 하는지>
- **<지표/이벤트 명 2>**
  (Why) <설명>
  (How) <모니터링 방법>

## ■ Sources
(시스템이 자동 주입합니다)

## START
지금 즉시 검색을 시작하고, 팩트를 기반으로 리포트를 작성하십시오. 상상하지 말고 검색하십시오.`;

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
${issue.sources ? issue.sources.join('\\n') : 'URL 없음'}
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

        const sourcesPattern = /(?:##?\s*)?■\s*Sources[\s\S]*$/i;
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
