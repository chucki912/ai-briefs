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

## 리포트 작성 규칙
1. **JSON 형식**: 반드시 아래의 JSON 스키마를 엄격히 준수하여 출력하세요.
2. **전문성**: 업계 전문가 수준의 깊이 있는 통찰력을 제공해야 합니다.
3. **언어**: 한국어로 작성하되, 핵심 전문 용어는 영어 원문을 병기하세요.
4. **출처**: 본문에 언급된 사실은 반드시 제공된 Context 내의 출처 기사(Source)를 인용하세요.

## JSON 출력 스키마
{
  "report_meta": {
    "title": "리포트 제목 (이슈의 요체를 담은 전문적인 제목)",
    "time_window": "분석 기간 (예: 2024-2026)",
    "lens": "분석 관점 (이 이슈를 바라보는 핵심 키워드/프레임워크)",
    "generated_at": "현재 시간 ISO"
  },
  "executive_summary": {
    "signal_summary": [{"text": "핵심 요약 문장", "citations": ["S1"]}],
    "what_changed": [{"text": "변화된 사실", "citations": ["S1"]}],
    "so_what": [{"text": "시사점", "citations": ["S2"]}]
  },
  "key_developments": [
    {
      "headline": "핵심 전개 상황 제목",
      "facts": [{"text": "사실 관계 1", "citations": ["S1"]}],
      "analysis": [{"text": "심층 분석 1", "basis": "근거 설명", "citations": ["S1", "S2"]}],
      "why_it_matters": [{"text": "중요성 요약", "citations": ["S3"]}],
      "evidence_level": "high",
      "citations": ["S1", "S2"]
    }
  ],
  "implications": {
    "market_business": [{"text": "시장/사업적 파급효과", "citations": ["S1"]}],
    "tech_product": [{"text": "기술/제품적 파급효과", "citations": ["S2"]}],
    "policy_regulation": [{"text": "정책/규제적 파급효과", "citations": ["S3"]}],
    "competitive_landscape": [{"text": "경쟁 구도 영향", "citations": ["S1"]}]
  },
  "sources": [
    {
      "sid": "S1",
      "publisher": "매체명",
      "date": "기사 날짜",
      "title": "기사 제목",
      "url": "기사 URL"
    }
  ]
}

JSON만 출력하세요. 마크다운 기호(\`\`\`) 없이 순수 JSON만 출력하세요.`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('[Trend Report Error]', error);
        return null;
    }
}

