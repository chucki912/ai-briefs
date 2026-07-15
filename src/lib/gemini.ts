import { GoogleGenerativeAI } from '@google/generative-ai';
import { NewsItem, IssueItem } from '@/types';
import { matchFrameworks, getFrameworkNames } from './analyzers/framework-matcher';
import { KEY_INSIGHT_FIELD_SPEC, KEY_INSIGHT_GUIDE, KEY_INSIGHT_CHECKLIST, ensureValidKeyInsight, logKeyInsightResult, type ValidatedKeyInsightResult } from './analyzers/key-insight';
import { recordKeyInsightMetrics } from './analyzers/key-insight-metrics';
import { getRecentIssues } from './store';
import { FLASH_MODEL, PRO_MODEL } from './gemini-models';

// Gemini API 클라이언트 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// 뉴스 분석 및 인사이트 생성
export async function analyzeNewsAndGenerateInsights(
    newsItems: NewsItem[]
): Promise<IssueItem[]> {
    const model = genAI.getGenerativeModel({ model: FLASH_MODEL });

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

            const issue = await generateIssueFromCluster(model, cluster, recentIssues);
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
// onKeyInsight: Key Insight 검증/재생성 결과를 관찰하기 위한 선택적 훅(평가/집계용). 프로덕션 호출부는 미전달.
export async function generateIssueFromCluster(
    model: ReturnType<typeof genAI.getGenerativeModel>,
    cluster: NewsItem[],
    recentIssues: IssueItem[] = [],
    onKeyInsight?: (r: ValidatedKeyInsightResult) => void
): Promise<IssueItem | null> {
    const primaryNews = cluster[0];
    const frameworks = matchFrameworks(primaryNews.title, primaryNews.description);

    // 뉴스 리스트에 인덱스 부여
    const indexedNews = cluster.map((n, i) => `[${i + 1}] 제목: ${n.title}\n출처: ${n.url}`).join('\n\n');

    const recentContextStr = recentIssues.length > 0
        ? recentIssues.map(issue => `- [${issue.headline}]\n  인사이트 요약: ${issue.insight.substring(0, 100)}...`).join('\n')
        : '이전 브리프 내용 없음';

    const prompt = `당신은 **글로벌 AI 산업 전략 애널리스트**입니다.

---

## 뉴스 클러스터 정보 (인덱스 부여됨)
${indexedNews}

---

## 적용 분석 프레임워크
${frameworks.length
            ? `아래는 참고용 분석 렌즈임. 렌즈의 명칭·수사를 본문에 그대로 복제하지 말고, 제공된 사실에 근거한 분석에만 사용할 것.\n${frameworks.map(f => `- ${f.name}: ${f.insightTemplate}`).join('\n')}`
            : `지정된 분석 렌즈 없음(none). 특정 프레임워크를 언급하거나 억지로 끼워넣지 말고, 오직 제공된 사실에 근거하여 분석할 것.`}

---

## 브리프 시리즈 컨텍스트
${recentContextStr}

---

## 출력 형식 (JSON)

{
  "headline": "한국어 헤드라인 (30자 이내)",
  "category": "아래 허용 목록 중 1개 선택",
  "singleTopicStatement": "단일 주장/논지 (50자 이내): 핵심 사건 1개와 이를 보강하는 데이터들을 엮은 단일 핵심 논지/주장 문장",
  "excludedFacts": ["주제와 무관하여 제외한 사실 1", "제외한 사실 2"],
  "keyFacts": [
    "[보도된 사실만: 구체적 수치·주체·날짜 포함. 메커니즘·인과·해석·의도는 절대 쓰지 말 것(그건 insight 소관). 출처·검증 꼬리표 없이 사실만 서술]",
    "[보도된 사실만]",
    "[보도된 사실만]"
  ],
  "insight": "${KEY_INSIGHT_FIELD_SPEC}",
  "confidence": "high | medium | low 중 1개 — 이 insight의 근거 확실성 자기평가",
  "soWhat": {
    "ifTrue": "이 신호가 사실이라면 산업 구조/경쟁 구도에서 무엇이 바뀌는가 (완성형 1문장)",
    "uncertain": "아직 검증되지 않았거나 주시해야 할 핵심 변수 (완성형 1문장)",
    "bet": "지금 시점의 합리적 베팅/대응 방향 — 구체적 주어 포함 (완성형 1문장)",
    "downside": "그 베팅이 틀렸을 때 감수해야 할 비용 또는 하방 리스크 (완성형 1문장)"
  },
  "hashtags": ["#키워드1", "#키워드2", "#키워드3"],
  "oneLineSummary": "이 카드가 주장하는 단일 논지(Thesis) 1문장 (100자 이내). 요약이 아닌 핵심 주장 명제여야 하며 팩트의 단순 나열을 금지함.",
  "relevantSourceIndices": [1, 2]
}

---

## 허용 category 목록 (반드시 아래 중 1개만 선택)

- Platform & Ecosystem
- Geopolitics & AI Regulation
- Computing Infrastructure
- AI Safety & Ethics
- Investment & Capital
- Enterprise AI Adoption
- Model & Technology
- Sovereign AI & Policy

---

## 작성 절차 (반드시 아래 순서로 실행)

### STEP 1. singleTopicStatement 확정 (단일 논지 지향)
- 클러스터 내에서 가장 파급력이 큰 **"핵심 사건 1개"**와 이를 보강하는 관련 데이터 1~2개를 엮어, 파편화되지 않은 단일 논지(Thesis)를 세우십시오.
- 클러스터에 서로 무관한 별개의 중대 발표들이 섞여 있다면 가장 지배적인 1개의 흐름만 선택하고 나머지는 버리십시오.

### STEP 2. 후보 사실 필터링 및 쪼개기 (keyFacts 작성 전 필수 실행)
- Q. "이 팩트는 STEP 1에서 선택한 핵심 논지를 뒷받침하는 팩트인가?"
  - YES → keyFacts 후보에 포함
  - NO  → 무조건 excludedFacts에 버릴 것.
- **수치적 엄밀성**: keyFacts에 수치(금액, 비중, 성능 등)가 언급될 경우 가능한 한 구체적인 수치와 기업명을 명확히 포함하십시오.
- **출처·검증 태그 금지**: keyFacts 문장 끝에 \`(Yahoo Finance, 2026년 7월 / 검증됨)\`, \`(... / 미검증)\`, \`(... 기준 / 신뢰도 보통)\` 같은 출처명·시점·신뢰도 꼬리표를 절대 붙이지 마십시오. 출처는 하단 Sources 링크로만 제공하며, 팩트 문장은 순수하게 사실만 서술합니다.
  * 예: "NVIDIA의 Blackwell 칩 공급 지연 가능성 제기"
  * 예: "CapEx $20B 투자 발표"
- **중요 (독립성)**: keyFacts 작성 시 singleTopicStatement(논지) 및 insight(시사점)의 내용을 반복하여 재진술하지 마십시오. 오직 객관적 팩트와 수치 데이터 전달에 집중해야 합니다.
- 팩트의 매끄러운 연결: 3개의 팩트는 핵심 논지를 구성하는 배경 -> 경과 -> 결과 또는 구체적 증거 데이터 형태로 긴밀히 연결되어야 합니다.
- **keyFacts에는 메커니즘·인과·해석·의도 추정을 절대 포함하지 마십시오. 오직 보도된 사실(수치·주체·날짜)만 서술합니다. 해석은 insight에서만 전개합니다.**

### STEP 4. 시리즈 컨텍스트 빌드업 (시리즈 컨텍스트가 있을 때 필수)
- 이전 브리프들의 요약(이전 논지 및 인사이트)을 읽고 **유기적으로 연결되는 서사(Storyline)**를 구성하십시오.
- 이전 브리프가 다룬 위협/기회와 어떻게 맞물려 흐름을 형성하는지 융합하십시오.

### STEP 5. insight(Key Insight) 및 soWhat 작성 (★판단형 의사결정 체계 적용★)
${KEY_INSIGHT_GUIDE}
  - 프레임워크가 지정된 경우에만 분석 렌즈로 참고하되, 프레임워크 명칭·수사를 본문에 복제하지 마십시오. 지정되지 않았으면(none) 프레임워크를 언급하지 말고 사실 기반으로만 분석하십시오.
  - soWhat은 위 Key Insight를 실행 관점에서 분해하는 상세 의사결정 매트릭스입니다. insight의 마지막(경영진 대응) 문장은 방향성 수준으로 제시하고, 구체적 베팅은 soWhat.bet에서 전개하여 문장을 그대로 복제하지 마십시오.
- **soWhat (4분 구조)**:
  - \`ifTrue\`: 이 신호가 노이즈가 아닌 실질적 사실이자 영구적 추세일 때 변하는 업계의 역학 구도를 기술하십시오.
  - \`uncertain\`: 현재 시점에서 아직 확인되지 않은 핵심 변수나 위험 요소를 명시하십시오.
  - \`bet\`: 현 상황에서 독자(의사결정 주체)가 감행해야 할 구체적이고 합리적인 베팅 전략을 구체적 주어(예: "국내 B2B SaaS 기업은...", "온디바이스 칩 제조사는...")를 포함하여 1문장으로 제시하십시오.
  - \`downside\`: 이 베팅이 실패하거나 가정이 틀렸을 때 직면하게 될 기회비용 또는 하방 리스크를 냉정하게 1문장으로 명시하십시오.

---

## 작성 규칙

### [규칙 1] 문체
- 100% 한국어 (기업명·전문용어 영문 병기)
- 전 항목 개조식 축약 문체 (명사형 종결: ~함, ~임, ~전망). 단, **insight 및 soWhat의 각 필드는 인과가 흐르는 완성형 문장으로 작성**할 것.
- 서술형 종결어미 완전 배제 (insight 및 soWhat 제외)

### [규칙 2] category 선택
- 허용 목록 중 1개만 선택

### [규칙 3] excludedFacts 의무 기재
- 후보에서 제외한 사실을 반드시 1개 이상 기재

### [규칙 4] relevantSourceIndices
- keyFacts에 직접 인용된 사실의 출처 기사 번호만 포함
- 정수 배열로만 표기

---

## 자체 검증 체크리스트 (JSON 출력 전 순서대로 확인)
[ ] 1. 핵심 사건을 중심으로 단일 논지를 관통하는 singleTopicStatement를 확정했는가?
[ ] 2. keyFacts 각 문장 끝에 출처명·시점·신뢰도(검증됨/미검증 등) 꼬리표가 붙지 않고 순수 사실만 서술되었는가?
[ ] 3. (Key Insight) ${KEY_INSIGHT_CHECKLIST.map((c, i) => `3-${i + 1}. ${c}`).join('\n[ ] ')}
[ ] 4. insight의 경영진 대응 문장이 soWhat.bet과 문장 단위로 중복되지 않고 방향성/실행의 층위가 구분되는가?
[ ] 5. soWhat의 4가지 필드(ifTrue, uncertain, bet, downside)가 각각 명확하게 1문장씩의 완성형 문장으로 작성되었는가?
[ ] 6. soWhat.bet에 구체적인 주어가 명시되어 있는가?
[ ] 7. category가 허용 목록 내 1개인가?
[ ] 8. relevantSourceIndices가 keyFacts 출처만 포함하는가?
[ ] 9. 각 필드 간(headline, oneLineSummary, keyFacts, insight) 내용의 복제 및 중복 서술이 철저하게 배제되었는가? (헤드라인=사건, 요약=논지명제, 팩트=사실만, 인사이트=시사점만)
[ ] 10. oneLineSummary가 단순한 사건 요약이 아니라, 이 브리프가 주장하는 핵심 논지(Thesis) 명제인가?

**★ 위 2, 3, 5, 6, 9 항목 중 하나라도 실패하면 해당 섹션을 즉시 재생성할 것 ★**

체크리스트 결과는 출력하지 마세요. JSON만 출력하세요.`;

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
        const headline = parsed.headline || parsed.title || '';
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

        const cleanedFacts: string[] = (parsed.keyFacts || []).map((fact: string) => fact.split('|')[0].trim());

        // Key Insight 검증 + 치명적 위반 시 최대 1회 재생성
        const kiResult = await ensureValidKeyInsight(
            parsed.insight || parsed.strategicInsight || '',
            { facts: cleanedFacts, title: parsed.headline || parsed.title, audience: parsed.category },
            async (regenPrompt: string) => {
                const r = await generateWithRetry(model, regenPrompt);
                return (await r.response).text();
            },
        );
        logKeyInsightResult(`Key Insight (${parsed.headline || parsed.title})`, kiResult);
        await recordKeyInsightMetrics(kiResult, 'ai'); // 내부에서 예외를 삼키므로 생성 실패로 이어지지 않음
        if (onKeyInsight) onKeyInsight(kiResult);
        const finalInsight = kiResult.insight;

        return {
            headline: parsed.headline || parsed.title,
            category: parsed.category,
            singleTopicStatement: parsed.singleTopicStatement,
            excludedFacts: parsed.excludedFacts || [],
            prescriptionLevel: parsed.prescriptionLevel,
            oneLineSummary: parsed.oneLineSummary,
            hashtags: parsed.hashtags,
            keyFacts: cleanedFacts,
            insight: finalInsight,
            confidence: parsed.confidence,
            framework: getFrameworkNames(frameworks),
            sources: finalSources.length > 0 ? finalSources : [cluster[0].url],
            soWhat: parsed.soWhat,
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
        const model = genAI.getGenerativeModel({ model: FLASH_MODEL });
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
        const model = genAI.getGenerativeModel({ model: FLASH_MODEL });
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
        const model = genAI.getGenerativeModel({ model: FLASH_MODEL });
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
    // Upgraded System Prompt: Deep Dive Integration Prompt v2
    const systemPrompt = `# SYSTEM INSTRUCTION — 브리프 심층 리포트(Deep Dive) 통합 프롬프트 v2

당신은 경력 20년의 산업 인텔리전스 애널리스트임.
입력된 단일 브리프(단신)를 기점으로, 그 이면의 **구조적 변화와 파급 효과**를 끝까지 파고드는 Deep Dive 리포트를 작성하는 것이 임무임.
브리프의 맥락을 100% 상속하되, 검색으로 정보의 깊이와 외연을 확장하여 의사결정자에게 판단 프레임을 제시할 것.

---

## ★ PRIME DIRECTIVE — 브리프와의 '깊이 차이' (이 리포트의 존재 이유)

본 리포트는 입력 브리프보다 **양(量)이 아니라 종(종)이 다른** 산출물이어야 함.
브리프가 구조적으로 수행할 수 없는 아래 3가지 도약을 반드시 완수할 것.

1. **[단위 도약] 사건 → 구조**
   - 입력 이슈를 '증상'으로 취급할 것.
   - 그 밑에서 움직이는 시스템(가치사슬·원가곡선·경쟁 해자)의 변화를 규명할 것.
   - 리포트 말미에 여전히 *같은 그 사건*만 반복하고 있으면 실패임.

2. **[증거 도약] 자기 출처 → 교차검증된 외부 증거**
   - ISSUE_URLS 외에 독립적 신규 출처 **최소 3개**를 검색으로 확보·인용할 것.
   - 브리프 원본 소스만 재인용하면 '깊이'가 아님 — 같은 증거를 다르게 쓴 것에 불과함.
   - 출처 확장은 장식이 아니라 **깊이의 정의 그 자체**임.

3. **[시간 도약] 스냅샷 → 궤적·분기점**
   - 이 사건이 더 긴 흐름의 어디쯤에 있는지(과거 궤적) 명시할 것.
   - 향후 6~12개월의 분기 시나리오와, 그 갈림길을 선별해주는 선행지표를 제시할 것.

### Anti-Redundancy Litmus (자가 검증 — 위배 시 재작성)
- 브리프와 본 리포트의 Executive Summary를 나란히 놓았을 때 **같은 말을 하고 있으면 실패**임.
- 브리프의 결론(soWhat)은 '가설'임. 본 리포트의 결론은 '외부 증거로 조사한 뒤의 **판정**'이어야 함.
- "이렇게 보임"이 아니라 → "조사 결과 이러하며, 여기까지는 검증됐고 여기부터는 여전히 불확실함" 형태로 진술할 것.

---

## ★ 독자에게 반드시 제공할 3가지 (Reader Value)

1. **정량 앵커(Quantitative Anchor)**
   - 베팅의 *크기·시점*을 바꾸는 검증 가능한 핵심 수치 1개를 도출할 것.
   - 그 수치의 출처·기준시점, 그리고 *어느 수준을 넘으면 판단이 뒤집히는지(임계치)*를 함께 명시할 것.
2. **인과 지도(Causal Map)**
   - 헤드라인에 아직 없는 2차·3차 파급을 그릴 것.
   - 누구의 마진이 눌리고, 어느 전방·후방·인접시장이 충격을 흡수하는지 연결선을 제시할 것.
3. **판단 프레임 + 폐기 조건(Decision Frame + Kill Trigger)**
   - 결론을 떠먹이지 말 것. 독자가 스스로 판단하고 *자신이 틀린 순간을 미리 알 수 있도록* 무장시킬 것.

---

## Critical Process: Triple-Search Heuristics (작성 전 필수)
작성 전, 반드시 아래 3가지 의도로 검색("googleSearch")을 수행할 것.
1. **[Primary Evidence]** 입력 이슈의 1차 사실(수치·날짜·주체)을 원출처 수준에서 정밀 확인.
2. **[Structural Context]** 이 사건이 속한 더 큰 구조(가치사슬·원가추이·정책)의 배경과 궤적을 탐색.
3. **[Independent Triangulation]** 입력 소스와 *독립적인* 신규 고품질 출처(IR 자료·전문 리포트·글로벌 테크 미디어)로 교차검증.

## Strategic Reasoning Chain (사고 구속 조건)
리포트 작성 전, 반드시 다음 사고 도구로 논리를 전개할 것.
- **Mechanism Limit**: 해당 기술/모델이 물리·화학·경제적 한계에 얼마나 도달했는가?
- **Structural Efficiency**: 수직 계열화·규모·전환비용이 경제적 해자를 얼마나 강화/약화하는가?
- **Second-Order Effects**: 이 변화가 1차 당사자가 아닌, 전방·후방·인접 시장에 미칠 2·3차 파급은 무엇인가?

---

## Core Rules

1. **Cold, Hard Facts**: 장밋빛 전망 지양. 경쟁사의 강점과 우리의 약점을 냉철하게 직시하는 분석을 우선할 것.
2. **No Mock Data (검증 강제)**: 모든 정량 주장(%, $, GWh, Ton, 점유율 등)에는 **인라인 출처와 기준시점을 괄호로 즉시 결합**할 것. 예: \`셀 원가 $89/kWh (BloombergNEF, 2025-09 기준)\`. 출처를 결합할 수 없는 수치는 작성 금지.
3. **Mechanism Over Labels**: \`(Basis: 네트워크 효과)\` 같은 프레임워크 라벨의 기계적 부착을 **절대 금지**함. 대신 해당 효과가 *왜·어떻게* 작동하는지 인과관계 문장으로 본문에서 증명할 것. (※ 모든 모듈 공통 — 라벨 부착/금지 정책을 본 규칙으로 일원화함)
4. **Source Expansion = Depth**: 입력 외 독립 신규 출처 최소 3개 확보. 미달 시 깊이 미달로 간주.
5. **Label Precision**: 아래 Output Format의 대괄호 \`[]\` 안 레이블은 변경·축약 금지. 정확히 그대로 출력할 것.
6. **No Empty Sections**: 모든 \`## ■\` 섹션에 실질적 내용을 포함할 것. 빈 섹션 금지.
7. **Professional Tone**: 모든 문장을 명사형 종결어미(~함, ~임, ~전망 등)의 짧은 '개조식 축약 문체'로 작성할 것. 긴 줄글(paragraph) 금지, 서술어(~습니다, ~한다) 금지, 하위 블릿(-) 적극 활용.
8. **No Hype**: "세계 최고", "초격차", "게임체인저", "거대한 물줄기" 등 과장 수사 배제. 중립적·검증 가능한 서술로 채울 것.

---

## Output Format
아래 포맷을 엄격히 준수할 것. 꺾쇠 \`< >\` 안 지시문은 실제 내용으로 치환하고, 대괄호 \`[ ]\` 레이블은 그대로 유지할 것.

# 브리프 심층 리포트: <이슈를 관통하는 제목>

분석대상: <구체적 대상(기업·기술·소재명)>
타겟: <의사결정자 유형 — CEO/CTO·전략기획·투자심사역 등>
기간: <분석 기준일> 기준 향후 6~12개월 전망
관점: <Technology / Market / Geopolitics / Supply Chain 중 택 1>

## ■ Executive Summary
> (브리프의 가설이 아니라, 외부 증거로 조사한 뒤의 '판정'으로 작성할 것)
- **[Signal]** <이 이슈가 보내는 핵심 신호 — 정량 앵커 수치와 출처 포함>
- **[Anchor]** <베팅의 크기·시점을 바꾸는 검증 가능한 핵심 수치 1개 + 그것이 뒤집히는 임계 수준 (출처 결합)>
- **[Change]** <이로 인해 변경되는 산업 구조 — 브리프에 없던 구조적 통찰일 것>
- **[So What]** <의사결정 프레임 — (사실일 때의 변화 / 아직 불확실한 것 / 합리적 베팅 / 하방 리스크) 4분면>

## ■ Key Developments (Deep Dive)
### <구체적 사건/발표명 1>
- **[Fact]** <검색된 구체적 사실 (수치·날짜·주체 필수, 인라인 출처 결합)>
- **[Analysis]** <산업 구조에 미치는 영향을 2~3개 하위 블릿으로 개조식 분석. 작동 메커니즘을 인과 문장으로 증명할 것 (Basis 꼬리표 금지)>

### <구체적 사건/발표명 2>
- **[Fact]** <검색된 구체적 사실 (인라인 출처 결합)>
- **[Analysis]** <2~3개 하위 블릿으로 메커니즘 설명 (Basis 꼬리표 금지)>

## ■ Second-Order Map (구조적 파급 지도)
> (브리프가 다루지 못한 '연결선'. 헤드라인에 아직 없는 2·3차 파급을 반드시 신규 발굴할 것)
- **[Primary Shift]** <이 사건이 드러낸 핵심 구조 변화 1줄>
- **[Upstream]** <후방(소재·부품·공급망)에 미치는 파급 — 누구의 마진/물량이 변하는가>
- **[Downstream]** <전방(완제품·수요처)에 미치는 파급>
- **[Adjacent]** <인접 시장(예: ESS·전력·반도체 등)이 흡수할 충격 또는 반사이익>

## ■ Implications
- **[Market]** <사실일 때의 시장 규모·CapEx·BM 영향과 하방 비용 — 수치·출처 포함>
- **[Tech]** <돌파 가능한 기술 경로와 잔존하는 불확실성>
- **[Comp]** <글로벌 경쟁사의 실질적 대응 동향 및 베팅 방향>
- **[Policy]** <관련 정책·규제 리스크의 트리거 조건>

## ■ Risks & Uncertainties
- **[Tech]** <기술 리스크 + 그것이 틀렸을 때의 하방 비용>
  - Mitigation: <대응 방안>
- **[Market]** <시장/거시 리스크 + 판단 유보 요인>
  - Mitigation: <대응 방안>
- **[Reg]** <규제 리스크 + 트리거 조건>
  - Mitigation: <대응 방안>

## ■ Watchlist: Indicators to Monitor
- **<핵심 선행 지표 1>**
  (Why) <왜 이것이 중요한 선행 트리거인지>
  (Threshold) <어떤 수치·국면에서 전략적 피보팅이 필요한지>
  (폐기 트리거) <이 가정과 논지가 완전히 무너지는 조건 1줄 — 필수>
- **<핵심 선행 지표 2>**
  (Why) <설명>
  (Threshold) <피보팅 기준>
  (폐기 트리거) <논지가 무너지는 조건 1줄 — 필수>

## ■ Sources
(시스템이 자동 주입함. 단, 본문 인라인 출처는 모델이 직접 결합할 것)

## START
지금 즉시 검색을 시작하고, 팩트를 기반으로 작성할 것. 상상하지 말고 검색할 것.
브리프보다 '종(종)이 다른' 깊이를 만들지 못하면 작성 실패임.`;

    const model = genAI.getGenerativeModel({
        model: PRO_MODEL,
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
    let lastError: any;
    for (let i = 0; i < retries; i++) {
        try {
            return await model.generateContent(prompt);
        } catch (error: any) {
            lastError = error;
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
    // 모든 재시도 실패 시 마지막 에러 throw
    throw lastError || new Error('Failed to generate content after all retries');
}
