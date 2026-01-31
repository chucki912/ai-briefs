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

    const prompt = `너는 트렌드센싱(T&I) 리포트 작성자다. 사용자가 제공한 기사/자료 묶음을 기반으로 "상세 리포트"를 아래 형식으로만 출력하라.

[작성 원칙]
- Fact(사실)과 Inference(해석/추론)를 분리해서 작성한다.
- 기사에 없는 내용은 단정하지 않는다. 필요한 경우 “근거 부족”이라고 명시한다.
- 모든 핵심 주장(수치/주체/시점/원인/영향)은 출처 태그 [S#]를 최소 1개 이상 붙인다.
- 중복 기사(동일 사건 반복 보도)는 하나의 시그널로 통합해 서술한다.
- 문체는 건조한 보고서 메모 톤. 문장 끝은 “~함/~있음/~가능성이 있음” 위주.
- 과장, 감탄, 마케팅 문구 금지. 결론을 과도하게 확정하지 말 것.
- 불확실성은 명시(예: “가능성 있음”, “추가 확인 필요”).

[입력 기대 형태]
- 기사/자료는 [S1], [S2] ... 형태로 ID가 부여되어 제공된다(제목/매체/날짜/URL/요지/발췌 등).
- 본문에서는 해당 ID로만 인용한다.

[출력 형식: Markdown 고정 / 순서 변경 금지]
# ${issue.headline}

## 0) Meta
- 기간: ${new Date().toLocaleDateString('ko-KR')} 기준
- 커버리지: 글로벌 및 주요 기술 시장
- 독자: 기술 전략 전문가 및 의사결정권자
- 관점(Lens): 기술-비즈니스 융합 관점

## 1) Signal Summary (5 lines)
- (5줄 이내로 핵심 시그널을 요약. 각 줄 끝에 [S#] 최소 1개)

## 2) What happened (Facts)
- (사실만 5~10개 bullet. 각 bullet 끝에 [S#])
- (서술 예: 발표/출시/인수/정책/지표 변동/고객 사례 등)

## 3) Why now (Drivers)
- (촉발 요인 3~5개. 기술/시장/규제/공급망/자본 중 선택. 각 bullet 끝에 [S#])
- (기사 근거가 약하면 “근거 부족” 명시)

## 4) So what (Implications)
### 4-1) Market / Business
- (3~6 bullet, [S#] 포함, 필요 시 Inference 표기)

### 4-2) Tech / Product
- (3~6 bullet, [S#] 포함)

### 4-3) Policy / Regulation
- (1~4 bullet, [S#] 포함)

### 4-4) Competitive Landscape
- (승자/패자/포지셔닝 변화 가능성. 2~5 bullet, [S#] 포함)

## 5) Scenarios (3)
### Base
- 요약: (1줄)
- 트리거 지표: (2개)
- 영향: (2개)

### Upside
- 요약: (1줄)
- 트리거 지표: (2개)
- 영향: (2개)

### Downside
- 요약: (1줄)
- 트리거 지표: (2개)
- 영향: (2개)

## 6) What to do (Actions)
### 0~2주
- (3~6 bullet, 실행 단위로 구체화)

### 1~3개월
- (3~6 bullet)

### 6~12개월
- (3~6 bullet)

## 7) Watchlist (Monitoring Signals)
- (6~10개. “무엇을/왜/어떻게 관측” 형태로 짧게)

## 8) Source Traceability
- (자동 생성된 [S#] 매핑 정보를 여기에 기입)
${issue.sources.map((url, i) => `- [S${i + 1}] ${url}`).join('\n')}

---

[분석 대상 데이터]
${context || '(수집된 본문 없음, 위 핵심 사실 기반 작성)'}`;


    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('[Trend Report Error]', error);
        return null;
    }
}

