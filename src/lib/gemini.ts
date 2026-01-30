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

// 단일 테스트용 함수
export async function testGeminiConnection(): Promise<boolean> {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const result = await model.generateContent('Say "Hello" in Korean');
        const response = await result.response;
        console.log('[Gemini Test]', response.text());
        return true;
    } catch (error) {
        console.error('[Gemini Connection Error]', error);
        return false;
    }
}
