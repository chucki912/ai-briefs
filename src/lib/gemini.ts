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

    const prompt = `당신은 AI 산업 전문 분석가입니다. 아래 뉴스를 분석하여 한국어 브리핑을 작성해주세요.

## 뉴스 정보
제목: ${primaryNews.title}
내용: ${primaryNews.description}
출처: ${primaryNews.source}
${cluster.length > 1 ? `\n관련 기사 ${cluster.length - 1}개 추가` : ''}

## 분석 프레임워크
${getFrameworkNames(frameworks)}
- ${frameworks.map(f => f.insightTemplate).join('\n- ')}

## 출력 형식 (JSON)
{
  "headline": "한국어 헤드라인 (25자 이내, 핵심 사실 중심)",
  "keyFacts": ["핵심 사실 1", "핵심 사실 2", "핵심 사실 3"],
  "insight": "프레임워크 기반 1-3줄 분석 인사이트"
}

## 작성 규칙
- 100% 한국어 (전문용어/기업명은 원어 병기)
- 객관적 수치, 공식 발언, 데이터 기반 서술
- 미확인 사실은 '추정됨', '가능성 있음'으로 표기
- 감정적 표현 배제, 건조하고 전문적인 분석 톤

JSON만 출력하세요.`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // JSON 추출
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('JSON not found in response');
        }

        const parsed = JSON.parse(jsonMatch[0]);

        return {
            headline: parsed.headline,
            keyFacts: parsed.keyFacts,
            insight: parsed.insight,
            framework: getFrameworkNames(frameworks),
            sources: cluster.map(n => n.url),
        };
    } catch (error) {
        console.error('[Issue Generation Error]', error);
        return null;
    }
}

// API 연결 테스트
export async function testGeminiConnection(): Promise<boolean> {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const result = await model.generateContent('Hello');
        const response = await result.response;
        return !!response.text();
    } catch (error) {
        console.error('[Gemini Connection Test Failed]', error);
        return false;
    }
}


// 트렌드 센싱 리포트 (Deep Dive) 생성 - Vercel Pro (300s) Optimized
// Vercel Pro 업그레이드로 인해 Job Splitting이 불필요해져 Monolithic으로 원복.
// 단, 400 Bad Request (Search + Schema) 해결을 위해 "Search Enable, Schema Disable" & Manual Parsing 적용.
export async function generateTrendReport(
    issue: IssueItem,
    context: string // Not strictly used if Search is active
): Promise<string | null> {
    const systemPrompt = `너는 산업 동향(Industry Trend Brief) 리포트를 작성하는 전문 트렌드센싱 리서치 전문가다. 
모든 리포트는 **반드시 한국어**로 작성해야 하며, 정보 밀도가 매우 높고 전략적인 관점이 담긴 "인텔리전스 리포트" 스타일을 유지한다.

[핵심 문체 지침]
- **한국어 작성 필수**: 모든 필드의 내용은 한국어로 작성한다. (기술 용어나 기업명은 원어 병기 가능)
- **고밀도 압축(High Density)**: 단순 요약이 아닌, 시장의 구조적 변화와 기술적 함의를 한 문장에 압축하여 전달한다.
- **전략적 통찰(Strategic Insight)**: 사실 전달을 넘어, 그것이 산업 생태계(ecosystem)나 경쟁 구도에 미치는 영향을 포함한다.
- **건조하고 객관적인 보고서 톤**: 수식어를 배제하고 담백하면서도 권위 있는 어조를 유지한다. (예: "진입함", "측면이 강함", "전략을 취함" 등)

[Deep Research 지침]
- **Google Search 활용**: 제공된 정보를 넘어, **Google Search 도구**를 적극적으로 사용하여 해당 이슈와 관련된 최신 뉴스, 기술 문서, 전문가 분석을 실시간으로 조사한다.
- **다각적 검증**: 5개 이상의 신뢰할 수 있는 출처를 검색하여 교차 검증한다.
- **최신성 확보**: 리포트 생성 시점(Generated At) 기준 가장 최신의 업데이트 내용을 반영한다.

[출력 규칙]
- **순수 JSON 데이터만 반환**: Markdown 포맷(\`\`\`json)을 포함하여 출력하되, 내용은 정의된 JSON Schema를 따라야 한다.
- **참고**: Google API 제한으로 인해 JSON 강제 모드(Schema)를 껐으므로, 반드시 형식을 지켜야 한다.`;

    const model = genAI.getGenerativeModel({
        model: 'gemini-3-pro-preview', // Pro Model (High Reasoning)
        systemInstruction: systemPrompt,
        tools: [{ googleSearch: {} } as any], // Search ENABLED
        // responseSchema: DISABLED to avoid 400 error with Search
    });

    const nowDate = new Date();
    const kstDateStr = nowDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const kstIsoStr = nowDate.toISOString();

    const userPrompt = `## 현재 날짜 및 시간 (KST)
- **일시**: ${kstDateStr}
- **ISO**: ${kstIsoStr}

## 분석 필요 이슈 (Deep Dive Request)
- **헤드라인**: ${issue.headline}
- **핵심 사실**: ${issue.keyFacts.join(', ')}
- **초기 인사이트**: ${issue.insight}
- **참고 키워드**: ${issue.framework}

## 사용자 요청
위 이슈에 대해 **Google Search를 사용하여 심층 조사(Deep Research)**를 수행하고, 확보된 최신 정보를 바탕으로 포괄적인 인텔리전스 리포트를 작성해줘.
기존에 알고 있는 지식뿐만 아니라, **반드시 검색 결과**를 근거로 사용하여 분석의 깊이와 신뢰도를 확보해야 한다.

## JSON Schema (이 형식을 준수할 것)
{
  "report_meta": { "title": "string", "time_window": "string", "coverage": "string", "audience": "string", "lens": "string", "generated_at": "string" },
  "executive_summary": { "signal_summary": [{"text": "string", "citations": []}], "what_changed": [{"text": "string", "citations": []}], "so_what": [{"text": "string", "citations": []}] },
  "key_developments": [{"headline": "string", "facts": [{"text": "string", "citations": []}], "analysis": [{"text": "string", "basis": "string", "citations": []}], "why_it_matters": [{"text": "string", "citations": []}], "evidence_level": "high/medium/low", "citations": []}],
  "themes": [{"theme": "string", "drivers": [{"text": "string", "citations": []}], "supporting_developments": [], "citations": []}],
  "implications": { "market_business": [{"text": "string", "citations": []}], "tech_product": [{"text": "string", "citations": []}], "policy_regulation": [{"text": "string", "citations": []}], "competitive_landscape": [{"text": "string", "citations": []}] },
  "risks_and_uncertainties": [{"risk": "string", "type": "market/tech/etc", "impact_paths": [{"text": "string", "citations": []}], "evidence_level": "high/medium/low", "citations": []}],
  "watchlist": [{"signal": "string", "why": "string", "how_to_monitor": "string"}],
  "sources": [{"sid": "string", "publisher": "string", "date": "string", "title": "string", "url": "string"}],
  "quality": { "coverage_gaps": [], "conflicts": [], "low_evidence_points": [] }
}`;

    try {
        console.log('[Trend API] Gemini Deep Research 분석 시작 (Pro/Monolithic)...');
        const result = await model.generateContent(userPrompt);
        const response = await result.response;
        const text = response.text();

        console.log(`[Trend API] Gemini 분석 완료 (길이: ${text.length}자)`);

        // Grounding Metadata 로깅
        const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
        if (groundingMetadata) {
            console.log('[Trend API] Grounding Metadata found:', JSON.stringify(groundingMetadata, null, 2));
        }

        // Manual validation/extraction since schema is off
        const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        return jsonMatch ? jsonMatch[0] : text;

    } catch (error) {
        console.error('[Trend Report Error]', error);
        return null;
    }
}
