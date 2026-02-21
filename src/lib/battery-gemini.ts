// Battery Industry Gemini Analyzer
// 배터리 산업 전용 분석기 (K-Battery 관점)

import { GoogleGenerativeAI } from '@google/generative-ai';
import { NewsItem, IssueItem } from '@/types';
import { BATTERY_CONFIG } from '@/configs/battery';
import { getRecentIssues } from './store';
import { checkDuplicateIssues, calculateSimilarity } from './gemini';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// 배터리 뉴스 분석 및 인사이트 생성
export async function analyzeBatteryNewsAndGenerateInsights(
    newsItems: NewsItem[]
): Promise<IssueItem[]> {
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    // 뉴스를 관련 주제별로 클러스터링
    const clusters = clusterBatteryNewsByTopic(newsItems);

    // 중복 방지를 위한 최근 이슈 조회 (지난 3일치)
    const recentIssues = await getRecentIssues(3);
    console.log(`[Battery Deduplication] Loaded ${recentIssues.length} recent issues for comparison.`);

    const issues: IssueItem[] = [];

    // 최대 5개 이슈만 생성
    const topClusters = clusters.slice(0, 5);

    for (const cluster of topClusters) {
        try {
            // 중복 체크 1단계: 헤드라인 유사도 (빠른 필터링)
            const isPotentialDupe = recentIssues.some(issue =>
                calculateSimilarity(issue.headline, cluster[0].title) > 0.6
            );

            if (isPotentialDupe) {
                console.log(`[Battery Dupe] Skipping likely duplicate cluster: ${cluster[0].title}`);
                continue;
            }

            const issue = await generateBatteryIssueFromCluster(model, cluster);
            if (issue) {
                // 중복 체크 2단계: 정밀 체크
                const isDuplicate = await checkDuplicateIssues(issue, recentIssues);
                if (isDuplicate) {
                    console.log(`[Battery Dupe] Discarded duplicate issue: ${issue.headline}`);
                    continue;
                }
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
  "headline": "한국어 헤드라인 (30자 이내, 단일 핵심 주제 중심)",
  "category": "적절한 카테고리 (영어)",
  "oneLineSummary": "이슈 전체를 요약하는 한 문장 (100자 이내)",
  "hashtags": ["#키워드1", "#키워드2", "#키워드3"],
  "keyFacts": [
    "핵심 사실 1 (구체적 수치/기업명 포함)",
    "핵심 사실 2",
    "핵심 사실 3"
  ],
  "insight": "위 3가지 핵심 사실을 종합하여, K-Battery(한국 배터리 산업) 생태계에 미치는 파급 효과와 전략적 시사점을 적용 분석 프레임워크에 구애받지 않고 자율적으로 넓게 확장하여 도출한 심층 인사이트 (공백 포함 300자 내외)",
  "relevantSourceIndices": [1, 2]
}

## 작성 규칙
- 100% 한국어 (기업명/전문용어는 영문 병기)
- **모든 출력 내용(headline, category, oneLineSummary, keyFacts, insight 등)은 반드시 명사형 종결어미(~함, ~임, ~전망 등)를 사용하는 '개조식 축약 문체'로 작성할 것. (예: "~합니다." -> "~함.", "~입니다." -> "~임.", "~기록했다" -> "~기록함") 서술어 철저히 배제.**
- **단일 주제 집중 (Strictly Single Topic)**: 하나의 브리프 카드는 반드시 하나의 구체적이고 명확한 주제(예: 특정 리튬 가격 변동, 특정 기업의 합작사 설립 등)만 다루어야 합니다. 서로 다른 여러 소식을 병렬로 나열하지 마세요.
- **중요**: \`relevantSourceIndices\` 필드에는 이 브리핑과 직접 관련된 핵심 기사 번호만 정수 배열로 포함하세요.
- **핵심 사실 (Key Facts)**: 반드시 **정확히 3개의 핵심 사실**을 도출하여 \`keyFacts\` 배열에 담으세요. 4개 이상의 사실이 섞이지 않도록 가장 중요한 3개만 선별하세요.
- **심층 인사이트**:
  - 단순 요약이 아닌, 추출된 3가지 사실이 **한국 배터리 기업(LGES, SK On, SDI, 소재사 등)**에 어떤 기회나 위협이 되는지 분석하세요.
  - 제공된 분석 프레임워크의 틀에만 얽매이지 말고, **자율적이고 폭넓은 시야(Autonomous)**로 시장의 판도 변화, 기술 주도권, 공급망 이슈 등을 자유롭게 연결하여 'So What?'을 도출하세요.
- 객관적 수치, 공식 발언 기반 서술 (수치 데이터가 있다면 반드시 포함)
- 감정적 표현 배제 (드라이하고 전문적인 톤 유지)

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
            headline: parsed.headline || parsed.title,
            category: parsed.category,
            oneLineSummary: parsed.oneLineSummary,
            hashtags: parsed.hashtags,
            keyFacts: parsed.keyFacts,
            insight: parsed.insight || parsed.strategicInsight,
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
    const nowDate = new Date();
    const kstDateStr = nowDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

    // Upgraded System Prompt: K-Battery Survival Strategy Edition (v2)
    const systemPrompt = `# Antigravity Prompt — 배터리 심층 전략 리포트 (K-Battery Survival Strategy Edition)

## Role
당신은 20년 경력의 '글로벌 배터리 산업 전략 컨설턴트'이자 '산업 분석 전문가'입니다.
제공된 배터리 브리프(단신) 이슈를 기점으로 하여, 그 이면의 가치사슬 구조적 변화와 파급 효과를 끝까지 파고드는 **'Deep Dive'** 리포트를 작성하는 것이 당신의 핵심 임무입니다.
글로벌 에너지 전환의 핵심인 배터리 산업에서 **'K-Battery의 생존과 도약'**을 위한 초격차 인텔리전스를 도출하십시오.
브리프의 맥락을 100% 상속하되, 검색을 통해 정보의 깊이와 외연을 확장하여 의사결정자에게 전략적 행동을 제시하십시오.

## Critical Process: Triple-Search Heuristics
**작성 전, 반드시 아래 3가지 의도를 가지고 검색("googleSearch")을 수행하십시오.**
1. **[Supply Chain Analysis]**: 핵심 광물(리튬, 니켈, 흑연 등)의 가격 추이, 공급선 변화, 자원 민족주의 리스크를 정밀 타격하여 검색하십시오.
2. **[Cost Curve & CapEx]**: 선도 기업(CATL, BYD vs K-Battery)의 공정 혁신, 투입 비용(CapEx), 제조 원가 하락 요인을 탐색하십시오.
3. **[Policy Moat]**: IRA, CRMA, 수입 관세 정책 등 각국의 보호무역주의가 실제 시장 점유율에 미치는 영향을 분석한 IR 자료나 전문지 보고서를 찾으십시오.

## Strategic Reasoning Chain (사고 구속 조건)
리포트를 작성하기 전, 반드시 다음의 사고 도구를 사용하여 논리를 전개하십시오.
- **Physics & Chemistry Limit**: 해당 기술(전고체, 실리콘 음극재, LFP 에너지 밀도 등)이 물리/화학적 한계에 얼마나 도달했는가?
- **Vertical Integration Efficiency**: 소재-셀-리사이클링으로 이어지는 수직 계열화가 경제적 해자를 얼마나 강화하는가?
- **Second-Order Effects Analysis**: 중국의 저가 공세가 완제품 단계가 아닌, 전방 '전기차 시장'과 후방 '에너지 저장 장치(ESS)' 시장에 미칠 2차적 파급 효과는 무엇인가?

## Core Rules
1) **Survival Dynamics**: 단순히 "한국 기업에게 유리하다"는 장밋빛 전망을 지양하십시오. 경쟁사의 강점과 우리의 약점을 **냉철하게 직시(Cold, Hard Facts)**하는 분석을 우선하십시오.
2) **No Mock Data**: 수치($, %, GWh, Ton)와 날짜, 구체적 공장 위치 또는 차종을 명시하십시오.
3) **Source Expansion**: 'ISSUE_URLS' 외에 최소 3개 이상의 고품질 해외 신규 소스(IR 자료, 전문 리포트, 글로벌 테크 미디어)를 확보하십시오.
4) **Label Precision**: 아래 Output Format의 대괄호 [] 안 레이블은 절대 변경·축약 금지. 정확히 그대로 출력할 것.
5) **No Empty Sections**: 모든 ## ■ 섹션에 반드시 실질적 내용을 포함할 것. 빈 섹션은 절대 금지.
6) **Minimum Depth**: [Deep Analysis] 태그 뒤에는 반드시 최소 3문장 이상의 분석 본문을 작성하고, (Basis: 근거)를 명시할 것.
7) **Professional Tone**: **모든 문장을 철저하게 명사형 종결어미(~함, ~임, ~전망 등)로 끝나는 '개조식 축약 문체'로 작성할 것. 서술어(~습니다, ~한다) 절대 금지.**

## Output Format
반드시 아래 포맷을 엄격히 준수하십시오.
꺾쇠 < > 안의 지시문은 당신이 실제 내용으로 치환해야 할 부분입니다.
대괄호 [ ] 안의 레이블은 그대로 유지하십시오.

# 브리프 심층 리포트: <이슈의 본질을 꿰뚫는 제목>

분석대상: <구체적 배터리 기술/소재/기업>
타겟: K-Battery 전략 의사결정자 및 투자심사역
기간: ${kstDateStr.split(' ')[0]} 기준 향후 6~12개월 전망
관점: <Supply Chain / Technology / Geopolitics 중 택 1>

## ■ Executive Summary
- [Signal] <배터리 산업 지형도를 흔드는 핵심 신호 — 수치 포함>
- [Change] <이 이슈로 인해 배터리 가치사슬이 변하는 구조적 지점>
- [So What] <K-Battery 기업들이 즉각적으로 취해야 할 전략적 대응 방향>

## ■ Key Developments (Strategic Analysis)
### <핵심 사건 1>
- [Fact] <검색된 구체적 사실 (GWh, 제조원가, 스펙 필수)>
- [Analysis] <이 사건이 숨기고 있는 전략적 의도와 시장 영향력을 최소 3문장 이상 분석> (Basis: <사용한 분석 프레임워크>)

### <핵심 사건 2>
- [Fact] <검색된 팩트>
- [Analysis] <이 사실이 촉발할 2차 파급 효과를 최소 3문장 이상 분석> (Basis: <근거>)

## ■ Cost & Technology Dynamics
### <테마명>
- **[Cost/Efficiency Logic]** <원가 절감 혹은 효율 향상의 메커니즘>
- **[Competitive Position]** <한국 기업과 글로벌 경쟁사(CATL 등)간의 격차 분석>

## ■ Implications
- [Market] <글로벌 수주 및 점유율 변화 전망 — 수치 포함>
- [Tech] <물리/화학적 한계 돌파 또는 기술적 초격차 유지 가능성>
- [Comp] <글로벌 경쟁사(CATL, BYD 등) 대비 우위 및 위협 요인>
- [Policy] <주요국 배터리 규제 및 보조금 정책 대응 시나리오>

## ■ Risks & Strategic Uncertainties
- **[Survival Risk]** <존립에 영향을 미칠 수 있는 중대 리스크>
  - Impact & Mitigation: <부정적 영향과 대응 방안>
- **[Market Risk]** <시장/거시경제 리스크>
  - Impact & Mitigation: <부정적 영향과 대응 방안>

## ■ Watchlist: Indicators to Monitor
- **<핵심 관측 지표 1>**
  (Why) <이 지표가 왜 중요한 선행 신호인지>
  (Threshold) <어떤 변화 국면에서 전략적 피보팅이 필요한지>
- **<핵심 관측 지표 2>**
  (Why) <설명>
  (Threshold) <피보팅 기준>

## ■ Sources
(시스템이 자동 주입합니다)

## START
지금 즉시 K-Battery 초격차 전략 분석을 시작하십시오. 검색이 우선입니다.`;

    const model = genAI.getGenerativeModel({
        model: 'gemini-3.1-pro-preview',
        systemInstruction: systemPrompt,
        tools: [{ googleSearch: {} } as any],
    });

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
        const sourcesPattern = /(?:##?\s*)?■\s*Sources[\s\S]*$/i;
        const bodyContent = text.replace(sourcesPattern, '').trim();
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
