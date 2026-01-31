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
    // 2.0 Flash 사용 권장 (JSON 모드 지원 우수)
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: { responseMimeType: 'application/json' }
    });

    const systemPrompt = `너는 산업 동향(Industry Trend Brief) 리포트를 작성하는 트렌드센싱 리서처다.
사용자가 제공한 기사/자료 묶음([S1], [S2] …)만 근거로 “상세 리포트”를 생성한다.

[핵심 원칙]
- Fact(사실)과 Inference(해석/추론)를 분리한다.
- 제공 자료에 없는 내용은 단정하지 않는다. 불확실하면 “근거 부족/추가 확인 필요”로 표기한다.
- 모든 핵심 주장(수치/주체/시점/원인/영향)은 출처를 명시한다.
  - JSON에서는 각 항목에 citations: ["S1","S3"] 형태로 포함한다.
- 중복 기사(동일 사건/보도)는 하나의 항목으로 통합한다.
- 문체는 건조한 보고서 톤. 과장/감탄/마케팅 문구 금지.
- “Action/실행과제/To-do” 섹션은 작성하지 않는다. (조직 내 동향 보고서 스타일 유지)

[출력 규칙]
- 최종 출력은 오직 JSON 1개 객체만 반환한다. (추가 텍스트/마크다운/코드펜스 금지)
- 반드시 아래 JSON Schema의 요구사항(필드/타입/필수값/금지된 추가필드)을 만족해야 한다.
- 인용은 본문에 [S#]를 쓰지 말고, 각 항목의 citations 배열로만 표현한다.

[품질 체크]
- citations가 비어 있으면 해당 문장/항목은 "evidence_level": "low"로 표시하고 notes에 근거 부족 사유를 쓴다.
- 서로 상충되는 주장(예: 수치/일자/원인)이 있으면 conflicts에 기록한다.`;

    const jsonSchema = `
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/industry-trend-brief.schema.json",
  "title": "Industry Trend Brief (Trend Sensing) - Deep Dive",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "report_meta",
    "executive_summary",
    "key_developments",
    "themes",
    "implications",
    "risks_and_uncertainties",
    "watchlist",
    "sources",
    "quality"
  ],
  "properties": {
    "report_meta": {
      "type": "object",
      "additionalProperties": false,
      "required": ["title", "time_window", "coverage", "audience", "lens", "generated_at"],
      "properties": {
        "title": { "type": "string", "minLength": 3 },
        "time_window": { "type": "string", "minLength": 3 },
        "coverage": { "type": "string", "minLength": 2 },
        "audience": { "type": "string", "minLength": 2 },
        "lens": { "type": "string", "minLength": 1 },
        "generated_at": {
          "type": "string",
          "description": "ISO 8601 datetime",
          "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T"
        }
      }
    },

    "executive_summary": {
      "type": "object",
      "additionalProperties": false,
      "required": ["signal_summary", "what_changed", "so_what"],
      "properties": {
        "signal_summary": {
          "type": "array",
          "minItems": 3,
          "maxItems": 5,
          "items": { "$ref": "#/$defs/statement_with_citations" }
        },
        "what_changed": {
          "type": "array",
          "minItems": 2,
          "maxItems": 5,
          "items": { "$ref": "#/$defs/statement_with_citations" }
        },
        "so_what": {
          "type": "array",
          "minItems": 2,
          "maxItems": 5,
          "items": { "$ref": "#/$defs/statement_with_citations" }
        }
      }
    },

    "key_developments": {
      "type": "array",
      "minItems": 3,
      "maxItems": 8,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["headline", "facts", "analysis", "why_it_matters", "evidence_level", "citations"],
        "properties": {
          "headline": { "type": "string", "minLength": 5 },
          "facts": {
            "type": "array",
            "minItems": 2,
            "maxItems": 8,
            "items": { "$ref": "#/$defs/fact" }
          },
          "analysis": {
            "type": "array",
            "minItems": 1,
            "maxItems": 6,
            "items": { "$ref": "#/$defs/inference" }
          },
          "why_it_matters": {
            "type": "array",
            "minItems": 1,
            "maxItems": 5,
            "items": { "$ref": "#/$defs/statement_with_citations" }
          },
          "evidence_level": { "type": "string", "enum": ["high", "medium", "low"] },
          "citations": { "$ref": "#/$defs/citations" },
          "notes": { "type": "string" }
        }
      }
    },

    "themes": {
      "type": "array",
      "minItems": 2,
      "maxItems": 6,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["theme", "drivers", "supporting_developments", "citations"],
        "properties": {
          "theme": { "type": "string", "minLength": 4 },
          "drivers": {
            "type": "array",
            "minItems": 1,
            "maxItems": 5,
            "items": { "$ref": "#/$defs/statement_with_citations" }
          },
          "supporting_developments": {
            "type": "array",
            "minItems": 1,
            "maxItems": 5,
            "items": { "type": "string" }
          },
          "citations": { "$ref": "#/$defs/citations" }
        }
      }
    },

    "implications": {
      "type": "object",
      "additionalProperties": false,
      "required": ["market_business", "tech_product", "policy_regulation", "competitive_landscape"],
      "properties": {
        "market_business": {
          "type": "array",
          "minItems": 2,
          "maxItems": 8,
          "items": { "$ref": "#/$defs/statement_with_citations" }
        },
        "tech_product": {
          "type": "array",
          "minItems": 2,
          "maxItems": 8,
          "items": { "$ref": "#/$defs/statement_with_citations" }
        },
        "policy_regulation": {
          "type": "array",
          "minItems": 0,
          "maxItems": 6,
          "items": { "$ref": "#/$defs/statement_with_citations" }
        },
        "competitive_landscape": {
          "type": "array",
          "minItems": 1,
          "maxItems": 8,
          "items": { "$ref": "#/$defs/statement_with_citations" }
        }
      }
    },

    "risks_and_uncertainties": {
      "type": "array",
      "minItems": 2,
      "maxItems": 8,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["risk", "type", "impact_paths", "evidence_level", "citations"],
        "properties": {
          "risk": { "type": "string", "minLength": 6 },
          "type": { "type": "string", "enum": ["market", "tech", "regulatory", "supply_chain", "geopolitics", "execution", "other"] },
          "impact_paths": {
            "type": "array",
            "minItems": 1,
            "maxItems": 4,
            "items": { "$ref": "#/$defs/statement_with_citations" }
          },
          "evidence_level": { "type": "string", "enum": ["high", "medium", "low"] },
          "citations": { "$ref": "#/$defs/citations" },
          "notes": { "type": "string" }
        }
      }
    },

    "watchlist": {
      "type": "array",
      "minItems": 6,
      "maxItems": 12,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["signal", "why", "how_to_monitor"],
        "properties": {
          "signal": { "type": "string", "minLength": 4 },
          "why": { "type": "string", "minLength": 4 },
          "how_to_monitor": { "type": "string", "minLength": 4 }
        }
      }
    },

    "sources": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["sid", "publisher", "date", "title", "url"],
        "properties": {
          "sid": { "type": "string", "pattern": "^S[0-9]+$" },
          "publisher": { "type": "string" },
          "date": { "type": "string", "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
          "title": { "type": "string" },
          "url": { "type": "string" },
          "note": { "type": "string" }
        }
      }
    },

    "quality": {
      "type": "object",
      "additionalProperties": false,
      "required": ["coverage_gaps", "conflicts", "low_evidence_points"],
      "properties": {
        "coverage_gaps": { "type": "array", "items": { "type": "string" } },
        "conflicts": { "type": "array", "items": { "type": "string" } },
        "low_evidence_points": { "type": "array", "items": { "type": "string" } }
      }
    }
  },

  "$defs": {
    "citations": {
      "type": "array",
      "items": { "type": "string", "pattern": "^S[0-9]+$" },
      "minItems": 0,
      "maxItems": 8,
      "uniqueItems": true
    },
    "statement_with_citations": {
      "type": "object",
      "additionalProperties": false,
      "required": ["text", "citations"],
      "properties": {
        "text": { "type": "string", "minLength": 6 },
        "citations": { "$ref": "#/$defs/citations" }
      }
    },
    "fact": {
      "type": "object",
      "additionalProperties": false,
      "required": ["text", "citations"],
      "properties": {
        "text": {
          "type": "string",
          "minLength": 6,
          "description": "기사에서 직접 확인 가능한 사실만"
        },
        "citations": { "$ref": "#/$defs/citations" }
      }
    },
    "inference": {
      "type": "object",
      "additionalProperties": false,
      "required": ["text", "basis", "citations"],
      "properties": {
        "text": { "type": "string", "minLength": 6, "description": "사실 기반의 해석/추론" },
        "basis": {
          "type": "string",
          "minLength": 6,
          "description": "추론 근거(어떤 사실로부터 왜 이런 해석이 가능한지)"
        },
        "citations": { "$ref": "#/$defs/citations" }
      }
    }
  }
}
`;

    const prompt = `${systemPrompt}

# JSON Schema
\`\`\`json
${jsonSchema}
\`\`\`

# 분석 대상 이슈 및 소스 매핑
- 헤드라인: ${issue.headline}
- 핵심 사실: ${issue.keyFacts.join(', ')}
${issue.sources.map((url, i) => `- [S${i + 1}] ${url}`).join('\n')}

[분석 대상 데이터 상세 (Context)]
${context || '(수집된 본문 없음. 위 핵심 사실과 외부 지식을 활용하여 작성하되 근거 부족 시 명시 바람)'}`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        // JSON 문자열 반환
        return response.text();
    } catch (error) {
        console.error('[Trend Report Error]', error);
        return null;
    }
}


