// Battery Industry Gemini Analyzer
// 배터리 산업 전용 분석기 (K-Battery 관점)

import { GoogleGenerativeAI } from '@google/generative-ai';
import { NewsItem, IssueItem } from '@/types';
import { BATTERY_CONFIG } from '@/configs/battery';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// 배터리 뉴스 분석 및 인사이트 생성
export async function analyzeBatteryNewsAndGenerateInsights(
    newsItems: NewsItem[]
): Promise<IssueItem[]> {
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    // 뉴스를 관련 주제별로 클러스터링
    const clusters = clusterBatteryNewsByTopic(newsItems);

    const issues: IssueItem[] = [];

    // 최대 5개 이슈만 생성
    const topClusters = clusters.slice(0, 5);

    for (const cluster of topClusters) {
        try {
            const issue = await generateBatteryIssueFromCluster(model, cluster);
            if (issue) {
                issues.push(issue);
            }
        } catch (error) {
            console.error('[Battery Gemini Error]', error);
        }
    }

    return issues;
}

// 배터리 주제별 뉴스 클러스터링
function clusterBatteryNewsByTopic(newsItems: NewsItem[]): NewsItem[][] {
    const clusters = new Map<string, NewsItem[]>();

    const keyTerms = [
        // 기업 (우선순위)
        'CATL', 'BYD', 'Tesla', 'Panasonic', 'Samsung SDI', 'SK On',
        'Albemarle', 'SQM', 'Ganfeng', 'BASF',
        // 기술
        'LFP', 'NCM', 'NCA', 'Solid-State', 'Sodium-ion', 'Lithium-metal',
        // 소재
        'Lithium', 'Nickel', 'Cobalt', 'Graphite', 'Manganese',
        // 응용
        'EV', 'ESS', 'Grid Storage',
        // 정책
        'IRA', 'CRMA', 'Tariff', 'Subsidy', 'Regulation'
    ];

    for (const item of newsItems) {
        let cluster = 'Global Battery Trends';
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

    // 크기순 정렬
    return Array.from(clusters.values())
        .sort((a, b) => b.length - a.length);
}

// 클러스터에서 배터리 이슈 생성
async function generateBatteryIssueFromCluster(
    model: ReturnType<typeof genAI.getGenerativeModel>,
    cluster: NewsItem[]
): Promise<IssueItem | null> {
    const primaryNews = cluster[0];

    // 해당 뉴스에 맞는 프레임워크 매칭
    const matchedFrameworks = matchBatteryFrameworks(primaryNews.title, primaryNews.description);

    // 뉴스 리스트에 인덱스 부여
    const indexedNews = cluster.map((n, i) => `[${i + 1}] 제목: ${n.title}\n출처: ${n.url}`).join('\n\n');

    const prompt = `${BATTERY_CONFIG.promptContext}

## 뉴스 클러스터 정보 (인덱스 부여됨)
${indexedNews}

## 적용 분석 프레임워크
${matchedFrameworks.map(f => `- ${f.name}: ${f.insightTemplate}`).join('\n')}

## 출력 형식 (JSON)
{
  "headline": "한국어 헤드라인 (25자 이내, 핵심 사실 중심)",
  "keyFacts": ["핵심 사실 1", "핵심 사실 2", "핵심 사실 3"],
  "insight": "K-Battery 관점의 전략적 인사이트 (1-3문장, 프레임워크 기반)",
  "relevantSourceIndices": [1, 3]
}

## 작성 규칙
- 100% 한국어 (기업명/전문용어는 영문 병기)
- **중요**: \`relevantSourceIndices\` 필드에는 이 브리핑과 직접 관련된 핵심 기사 번호만 정수 배열로
- K-Battery 시사점 반드시 포함 (한국 배터리 기업에 어떤 영향?)
- 객관적 수치, 공식 발언 기반 서술
- 감정적 표현 배제

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

        // 소스 필터링
        let selectedSources: string[] = [];
        if (parsed.relevantSourceIndices && Array.isArray(parsed.relevantSourceIndices)) {
            selectedSources = parsed.relevantSourceIndices
                .map((idx: number) => cluster[idx - 1]?.url)
                .filter((url: string) => url !== undefined);
        }

        // 최소 1개 소스 보장
        if (selectedSources.length === 0) {
            selectedSources = [cluster[0].url];
        }

        return {
            headline: parsed.headline,
            keyFacts: parsed.keyFacts,
            insight: parsed.insight,
            framework: matchedFrameworks.map(f => f.name).join(', '),
            sources: selectedSources,
        };
    } catch (error) {
        console.error('[Battery Issue Generation Error]', error);
        return null;
    }
}

// 배터리 프레임워크 매칭
function matchBatteryFrameworks(title: string, description: string) {
    const content = (title + ' ' + description).toLowerCase();

    return BATTERY_CONFIG.analysisFrameworks.filter(framework =>
        framework.triggerKeywords.some(kw => content.includes(kw.toLowerCase()))
    ).slice(0, 2); // 최대 2개 프레임워크
}

// 배터리 트렌드 리포트 생성
export async function generateBatteryTrendReport(
    issue: IssueItem,
    context: string
): Promise<string | null> {
    const systemPrompt = `# K-Battery 심층 분석 리포트 생성기

## Role
당신은 'K-Battery(한국 배터리 산업) 관점의 글로벌 배터리 산업 전략 컨설턴트'입니다.
브리프(단신)의 정보를 기반으로 더 깊이 있는 "심층 분석"을 수행합니다.

## 핵심 목표
1) **소스 상속**: 입력된 'ISSUE_URLS'는 브리프의 원본 소스입니다.
2) **소스 확장**: googleSearch를 사용하여 추가 고품질 소스를 검색하세요.
3) **K-Battery 시사점**: 모든 분석에 한국 배터리 기업 관점 포함

## 5대 분석 프레임워크
1. **지정학 및 패권**: IRA, CRMA, 중국 규제, 자원 민족주의
2. **산업 구조 및 BM 변화**: 수직계열화, JV, 리사이클링
3. **경제적 해자**: 기술 Lock-in, 규모의 경제, 생태계 지배력
4. **밸류체인 역학**: 리튬 가격, 이익 풀 이동, 병목
5. **규제 및 기술 장벽**: ESG, 탄소발자국, 인증

## OUTPUT TEMPLATE

# [트렌드 리포트] {이슈를 한 문장으로 요약한 제목}

분석대상: 글로벌 배터리 산업
타겟: K-Battery 전략 의사결정자
기간: {날짜 범위}
관점: {적용 프레임워크}

## ■ Executive Summary
- **[Signal]** {핵심 신호}
- **[Change]** {산업 구조 변화}
- **[So What]** {K-Battery 전략적 함의}

## ■ Key Developments
### [{핵심 전개}]
- (Fact) {확정 사실}
- (Analysis) {분석} (Basis: {프레임워크})

## ■ K-Battery Implications
- **[기회]** {한국 기업에게 기회가 되는 요소}
- **[위협]** {한국 기업에게 위협이 되는 요소}
- **[대응 방향]** {전략적 대응 방향}

## ■ Risks & Uncertainties
- **[tech]** {기술 리스크}
- **[market]** {시장 리스크}
- **[reg]** {규제 리스크}

## ■ Watchlist
- **{관측 지표}**
(Why) {중요성}
(How) {모니터링 방법}

## ■ Sources
(시스템이 자동 주입)

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
        console.log('[Battery Trend] 심층 리포트 생성 시작...');
        const result = await generateWithRetry(model, userPrompt);
        const response = await result.response;
        let text = response.text();

        // 소스 처리
        const briefingSources = issue.sources || [];
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

        const finalUniqueSources = Array.from(new Set([...briefingSources, ...additionalSources]));

        // 소스 섹션 렌더링
        let newSourcesSection = '\n## ■ Sources\n';
        finalUniqueSources.forEach((url, idx) => {
            try {
                const urlObj = new URL(url);
                const hostname = urlObj.hostname.replace('www.', '');
                const label = briefingSources.includes(url) ? 'Brief Origin' : 'Deep Research';
                newSourcesSection += `- [${idx + 1}] ${hostname} | ${kstDateStr.split(' ')[0]} | [${label}] ${url}\n`;
            } catch (e) {
                newSourcesSection += `- [${idx + 1}] Source | ${url}\n`;
            }
        });

        const bodyContent = text.replace(/## ■ Sources[\s\S]*$/i, '').trim();
        const finalReport = `${bodyContent}\n\n${newSourcesSection}`;

        console.log(`[Battery Trend] 소스: Brief(${briefingSources.length}) -> Report(${finalUniqueSources.length})`);

        return finalReport;
    } catch (error) {
        console.error('[Battery Trend Report Error]', error);
        return null;
    }
}

// Retry 로직
async function generateWithRetry(model: any, prompt: string, retries = 3, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await model.generateContent(prompt);
        } catch (error: any) {
            const isOverloaded = error.status === 503 || error.message?.includes('overloaded');
            const isRateLimit = error.status === 429 || error.message?.includes('RESOURCE_EXHAUSTED');

            if ((isOverloaded || isRateLimit) && i < retries - 1) {
                console.warn(`[Battery Gemini Retry] Attempt ${i + 1} failed. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
                continue;
            }
            throw error;
        }
    }
}
