import { GoogleGenerativeAI } from '@google/generative-ai';
import { NewsItem, IssueItem } from '@/types';
import { matchFrameworks, getFrameworkNames } from './analyzers/framework-matcher';
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
async function generateIssueFromCluster(
    model: ReturnType<typeof genAI.getGenerativeModel>,
    cluster: NewsItem[],
    recentIssues: IssueItem[] = []
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
${frameworks.map(f => `- ${f.name}: ${f.insightTemplate}`).join('\n')}

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
    "[추출된 핵심 사실 내용 (가능한 경우 괄호로 출처·시점·신뢰도 명시, 예: CapEx $X (2026 Q1 가이던스 기준 / 미검증))] | 메커니즘: [singleTopicStatement의 메커니즘과 동일한지 명시]",
    "[추출된 핵심 사실 내용 (출처·시점 명시)] | 메커니즘: [동일 확인]",
    "[추출된 핵심 사실 내용 (출처·시점 명시)] | 메커니즘: [동일 확인]"
  ],
  "insight": "인과관계가 흐르는 2~3문장 분량의 완성형 문단 형태 심층 인사이트. 이미 keyFacts에 나열된 팩트를 되풀이하거나 요약하지 말고, 해당 사건이 시장/산업 구조에 주는 본질적 의미와 '그래서 무엇을 의미하는지'에만 온전히 집중할 것.",
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
- **수치적 엄밀성 부착**: keyFacts에 수치(금액, 비중, 성능 등)가 언급될 경우, 가능한 한 괄호 안에 출처와 시점, 그리고 신뢰도 수준을 명시하십시오.
  * 예: "NVIDIA의 Blackwell 칩 공급 지연 가능성 제기 (2026 Q1 공급망 서베이 기준 / 신뢰도 보통)"
  * 예: "CapEx $20B 투자 발표 (MS 2025 Q4 실적 발표 기준 / 검증됨)"
- **중요 (독립성)**: keyFacts 작성 시 singleTopicStatement(논지) 및 insight(시사점)의 내용을 반복하여 재진술하지 마십시오. 오직 객관적 팩트와 수치 데이터 전달에 집중해야 합니다.
- 팩트의 매끄러운 연결: 3개의 팩트는 핵심 논지를 구성하는 배경 -> 경과 -> 결과 또는 구체적 증거 데이터 형태로 긴밀히 연결되어야 합니다.
- 출력 시 각 Fact 문장 뒤에 "| 메커니즘: [확인 내용]" 형식으로 동일성 명시.

### STEP 4. 시리즈 컨텍스트 빌드업 (시리즈 컨텍스트가 있을 때 필수)
- 이전 브리프들의 요약(이전 논지 및 인사이트)을 읽고 **유기적으로 연결되는 서사(Storyline)**를 구성하십시오.
- 이전 브리프가 다룬 위협/기회와 어떻게 맞물려 흐름을 형성하는지 융합하십시오.

### STEP 5. insight 및 soWhat 작성 (★판단형 의사결정 체계 적용★)
- **insight**: 
  - 팩트의 단순 요약을 지양하고, 해당 흐름이 초래할 **인과관계 기반의 구조적 변화**를 2~3문장의 완성형 문단으로 작성하십시오.
  - **중요 (독립성)**: insight 작성 시 headline, oneLineSummary(논지), keyFacts에 이미 기술된 사실관계를 다시 나열하거나 요약하여 복제하지 마십시오. 오직 분석과 향후 미칠 파급 영향(시사점)에 집중하십시오.
  - ❌ 금지 조건:
    * "~의 일환임", "~을 상징함", "~로의 전환이 시급함" 같은 모호한 선언형 마무리 금지.
    * 문장 끝에 기계적으로 "(※ trade-off: ...)"를 붙이는 행위 금지.
    * 직접적인 행동지시 문구("~하라", "~해야 한다")는 insight 섹션에서 금지. (행동 및 베팅은 \`soWhat\` 필드에서 서술)
  - 적용 분석 프레임워크의 핵심 작동 메커니즘을 최소 1회 자연스러운 문장으로 녹여 서술하십시오.
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
[ ] 2. keyFacts의 수치나 핵심 정보에 가능한 한 괄호 출처 및 시점/신뢰도가 명시되어 있는가?
[ ] 3. insight가 단순 요약이 아닌, 인과관계가 흐르는 2~3문장의 완성형 문단으로 작성되었는가?
[ ] 4. insight 내부에 "~하라" 같은 직접적인 행동 처방이 배제되었는가?
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

        return {
            headline: parsed.headline || parsed.title,
            category: parsed.category,
            singleTopicStatement: parsed.singleTopicStatement,
            excludedFacts: parsed.excludedFacts || [],
            prescriptionLevel: parsed.prescriptionLevel,
            oneLineSummary: parsed.oneLineSummary,
            hashtags: parsed.hashtags,
            keyFacts: parsed.keyFacts.map((fact: string) => fact.split('|')[0].trim()),
            insight: parsed.insight || parsed.strategicInsight,
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
    // Upgraded System Prompt: Super Intelligence Expert Edition
    const systemPrompt = `# Antigravity Prompt — AI 심층 전략 리포트 (Super Intelligence Expert Edition)

## Role
당신은 20년 경력의 '글로벌 AI 산업 전략 컨설턴트'이자 '산업 분석 전문가'입니다.
제공된 브리프(단신) 이슈를 기점으로 하여, 그 이면의 구조적 변화와 파급 효과를 끝까지 파고드는 **'Deep Dive'** 리포트를 작성하는 것이 당신의 핵심 임무입니다.
브리프의 맥락을 100% 상속하되, 검색을 통해 정보의 깊이와 외연을 확장하여 의사결정자에게 전략적 판단을 제시하십시오.

## Critical Process: Triple-Search Heuristics
**작성 전, 반드시 아래 3가지 의도를 가지고 검색("googleSearch")을 수행하십시오.**
1. **[Fact Check & Expansion]**: 브리프 내용을 최신 데이터로 갱신하고, 구체적 스펙·출시일·시장 데이터를 확보하십시오.
2. **[Anti-Thesis Search]**: 이 이슈의 반론, 기술적 한계, 회의적 시각을 검색하여 균형 잡힌 분석을 확보하십시오.
3. **[Value Chain Impact]**: 이 이슈가 상류(연구/학계)→중류(플랫폼/인프라)→하류(SaaS/최종 사용자)에 걸쳐 미치는 파급 효과를 검색하십시오.

## Core Rules
1) **No Mock Data**: "추후 발표 예정", "다양한 기업들" 같은 모호한 표현 절대 금지. 실명, 구체적 수치($, %, 날짜), 공식 발언만 사용.
2) **Source Extension**: ISSUE_URLS는 출발점. 최소 3개 이상의 새로운 고품질 글로벌 소스를 추가하여 분석의 객관성 확보.
3) **Professional Tone**: **모든 문장을 철저하게 명사형 종결어미(~함, ~임, ~전망 등)로 끝나는 짧은 '개조식 축약 문체'로 작성할 것. 긴 줄글(paragraph) 형태의 서술을 절대 금지하며, 하위 블릿(-)을 적극 활용하여 간결하게 작성할 것. 서술어(~습니다, ~한다) 절대 금지.**
4) **Label Precision**: 아래 Output Format의 대괄호 [] 안 레이블은 절대 변경·축약 금지. 정확히 그대로 출력할 것.
5) **No Empty Sections**: 모든 ## ■ 섹션에 반드시 실질적 내용을 포함할 것. 빈 섹션은 절대 금지.
6) **Mechanism Over Labels**: 경영/경제 프레임워크(예: 파괴적 혁신, 전환비용, 네트워크 효과, 규모의 경제 등) 개념 라벨을 기계적으로 부착하는 행위(예: \`(Basis: 네트워크 효과)\`)를 금지합니다. 대신, 해당 효과가 왜 그리고 어떻게 작동하는지 분석 본문의 긴밀한 인과관계 문장을 통해 논리적으로 서술하십시오.

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
- **[So What]** <기존 산업 참여자들이 주목해야 할 구조적 임계점과 결정 프레임(사실일 때의 변화 / 아직 불확실한 것 / 합리적 베팅 / 하방 리스크) 제시>

## ■ Key Developments (Deep Dive)
### <구체적 사건/발표명 1>
- [Fact] <검색된 구체적 사실 (수치, 날짜, 기업명 필수)>
- [Analysis] <이 사건이 산업 구조에 미치는 영향을 2~3개의 하위 블릿으로 개조식 분석하며 작동 메커니즘을 설명 (Basis 꼬리표 부착 금지)>

### <구체적 사건/발표명 2>
- [Fact] <검색된 구체적 사실>
- [Analysis] <분석 내용을 2~3개의 하위 블릿으로 개조식 분석하며 작동 메커니즘을 설명 (Basis 꼬리표 부착 금지)>

## ■ Core Themes
### <테마명>
- **[Driver]** <이 테마를 이끄는 핵심 동인>
- **[Context]** <배경 설명 및 연관 기업 동향>

## ■ Implications
- [Market] <사실일 때의 시장 규모, CapEx, 비즈니스 모델 영향과 하방 비용 — 수치 포함>
- [Tech] <돌파 가능한 기술적 경로와 잔존하는 불확실성>
- [Comp] <경쟁사들의 실질적 대응 동향 및 베팅 방향>
- [Policy] <관련 정책 및 규제 리스크의 트리거 조건>

## ■ Risks & Uncertainties
- **[Tech]** <기술적 리스크와 그것이 틀렸을 때의 하방 비용>
- **[Market]** <시장 리스크와 판단 유보 요인>

## ■ Watchlist
- **<지표/이벤트 명 1>**
  (Why) <이것이 왜 중요한 선행 트리거인지>
  (How) <무엇을 어떻게 모니터링해야 하는지>
  (폐기 트리거) <이 가정과 논지가 완전히 무너지는 조건 1줄>
- **<지표/이벤트 명 2>**
  (Why) <설명>
  (How) <모니터링 방법>
  (폐기 트리거) <이 가정과 논지가 완전히 무너지는 조건 1줄>

## ■ Sources
(시스템이 자동 주입합니다)

## START
지금 즉시 검색을 시작하고, 팩트를 기반으로 리포트를 작성하십시오. 상상하지 말고 검색하십시오.`;

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
