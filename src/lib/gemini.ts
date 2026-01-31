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
    // 간단한 클러스터링: 제목의 주요 단어로 그룹화
    const clusters = new Map<string, NewsItem[]>();

    for (const item of newsItems) {
        // 주요 기업명/기술명으로 클러스터링
        const keyTerms = [
            'OpenAI', 'Anthropic', 'Google', 'Meta', 'Microsoft', 'NVIDIA',
            'GPT', 'Claude', 'Gemini', 'Llama', 'xAI',
            'regulation', 'chip', 'GPU', 'safety'
        ];

        let cluster = 'general';
        for (const term of keyTerms) {
            if (item.title.toLowerCase().includes(term.toLowerCase())) {
                cluster = term;
                break;
            }
        }

        if (!clusters.has(cluster)) {
            clusters.set(cluster, []);
        }
        clusters.get(cluster)!.push(item);
    }

    // 크기순 정렬하여 반환
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

// ... (testGeminiConnection)

// 트렌드 센싱 리포트 (Deep Dive) 생성
export async function generateTrendReport(
    issue: IssueItem,
    context: string
): Promise<string | null> {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' }); // 2.0 Flash 사용 권장 (긴 컨텍스트 처리)

    const prompt = `당신은 글로벌 AI 산업의 수석 분석가입니다. 
제공된 뉴스 이슈와 추가 수집된 기사 본문(Context)을 바탕으로, 심층적인 "트렌드 센싱 리포트"를 작성해주세요.

## 분석 대상 이슈
- **헤드라인**: ${issue.headline}
- **핵심 사실**: ${issue.keyFacts.join(', ')}
- **초기 인사이트**: ${issue.insight}

## 추가 수집된 기사 본문 (Context)
${context || '(추가 본문 수집 실패, 위 핵심 사실을 바탕으로 내재된 지식을 활용하여 분석하세요)'}

## 리포트 작성 가이드라인
1. **전문성**: 업계 전문가가 읽을 법한 깊이 있는 통찰력을 제공하세요.
2. **구조**: 아래 목차를 엄격히 준수하세요.
3. **언어**: 한국어로 작성하되, 핵심 전문 용어는 영어 원문을 병기하세요.
4. **서식**: 가독성 높은 Markdown 형식을 사용하세요 (볼드체, 리스트 등 활용).

## 리포트 목차 (Output Format)

### 1. Executive Summary (요약)
- 이슈의 본질과 핵심 시사점을 3줄 요약으로 제시합니다.

### 2. Context & History (배경 및 흐름)
- 이 이슈가 발생하게 된 배경은 무엇인가?
- 과거 유사 사례나 기술적 발전 과정은 어떠했는가?

### 3. Key Players & Ecosystem (주요 플레이어 및 생태계)
- 이 이슈를 주도하는 기업/인물은 누구이며, 그들의 의도는 무엇인가?
- 경쟁사나 파트너 생태계에 어떤 영향을 미치는가?

### 4. Technological & Business Impact (기술적/사업적 파급력)
- 기술적 관점: 어떤 기술적 혁신이나 난제가 있는가?
- 비즈니스 관점: 시장 판도를 어떻게 바꿀 것인가? (Winner & Loser)

### 5. Future Outlook (향후 6-12개월 전망)
- 단기 및 중기적으로 어떤 시나리오가 예상되는가?
- 우리가 주목해야 할 다음 마일스톤은 무엇인가?

### 6. Actionable Insight (대응 전략)
- 관련 기업이나 투자자, 혹은 개발자는 지금 무엇을 준비해야 하는가?
- 구체적인 실행 제언을 한 문장으로 강력하게 제시하세요.

리포트를 작성해주세요.`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('[Trend Report Error]', error);
        return null;
    }
}

