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

    const jsonSchema = {
        "type": "object",
        "required": ["report_meta", "executive_summary", "key_developments", "themes", "implications", "risks_and_uncertainties", "watchlist", "sources", "quality"],
        "properties": {
            "report_meta": {
                "type": "object",
                "required": ["title", "time_window", "coverage", "audience", "lens", "generated_at"],
                "properties": {
                    "title": { "type": "string" },
                    "time_window": { "type": "string" },
                    "coverage": { "type": "string" },
                    "audience": { "type": "string" },
                    "lens": { "type": "string" },
                    "generated_at": { "type": "string" }
                }
            },
            "executive_summary": {
                "type": "object",
                "required": ["signal_summary", "what_changed", "so_what"],
                "properties": {
                    "signal_summary": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["text", "citations"],
                            "properties": {
                                "text": { "type": "string" },
                                "citations": { "type": "array", "items": { "type": "string" } }
                            }
                        }
                    },
                    "what_changed": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["text", "citations"],
                            "properties": {
                                "text": { "type": "string" },
                                "citations": { "type": "array", "items": { "type": "string" } }
                            }
                        }
                    },
                    "so_what": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["text", "citations"],
                            "properties": {
                                "text": { "type": "string" },
                                "citations": { "type": "array", "items": { "type": "string" } }
                            }
                        }
                    }
                }
            },
            "key_developments": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["headline", "facts", "analysis", "why_it_matters", "evidence_level", "citations"],
                    "properties": {
                        "headline": { "type": "string" },
                        "facts": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "required": ["text", "citations"],
                                "properties": {
                                    "text": { "type": "string" },
                                    "citations": { "type": "array", "items": { "type": "string" } }
                                }
                            }
                        },
                        "analysis": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "required": ["text", "basis", "citations"],
                                "properties": {
                                    "text": { "type": "string" },
                                    "basis": { "type": "string" },
                                    "citations": { "type": "array", "items": { "type": "string" } }
                                }
                            }
                        },
                        "why_it_matters": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "required": ["text", "citations"],
                                "properties": {
                                    "text": { "type": "string" },
                                    "citations": { "type": "array", "items": { "type": "string" } }
                                }
                            }
                        },
                        "evidence_level": { "type": "string", "enum": ["high", "medium", "low"] },
                        "citations": { "type": "array", "items": { "type": "string" } },
                        "notes": { "type": "string" }
                    }
                }
            },
            "themes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["theme", "drivers", "supporting_developments", "citations"],
                    "properties": {
                        "theme": { "type": "string" },
                        "drivers": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "required": ["text", "citations"],
                                "properties": {
                                    "text": { "type": "string" },
                                    "citations": { "type": "array", "items": { "type": "string" } }
                                }
                            }
                        },
                        "supporting_developments": { "type": "array", "items": { "type": "string" } },
                        "citations": { "type": "array", "items": { "type": "string" } }
                    }
                }
            },
            "implications": {
                "type": "object",
                "required": ["market_business", "tech_product", "policy_regulation", "competitive_landscape"],
                "properties": {
                    "market_business": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["text", "citations"],
                            "properties": {
                                "text": { "type": "string" },
                                "citations": { "type": "array", "items": { "type": "string" } }
                            }
                        }
                    },
                    "tech_product": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["text", "citations"],
                            "properties": {
                                "text": { "type": "string" },
                                "citations": { "type": "array", "items": { "type": "string" } }
                            }
                        }
                    },
                    "policy_regulation": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["text", "citations"],
                            "properties": {
                                "text": { "type": "string" },
                                "citations": { "type": "array", "items": { "type": "string" } }
                            }
                        }
                    },
                    "competitive_landscape": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["text", "citations"],
                            "properties": {
                                "text": { "type": "string" },
                                "citations": { "type": "array", "items": { "type": "string" } }
                            }
                        }
                    }
                }
            },
            "risks_and_uncertainties": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["risk", "type", "impact_paths", "evidence_level", "citations"],
                    "properties": {
                        "risk": { "type": "string" },
                        "type": { "type": "string", "enum": ["market", "tech", "regulatory", "supply_chain", "geopolitics", "execution", "other"] },
                        "impact_paths": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "required": ["text", "citations"],
                                "properties": {
                                    "text": { "type": "string" },
                                    "citations": { "type": "array", "items": { "type": "string" } }
                                }
                            }
                        },
                        "evidence_level": { "type": "string", "enum": ["high", "medium", "low"] },
                        "citations": { "type": "array", "items": { "type": "string" } },
                        "notes": { "type": "string" }
                    }
                }
            },
            "watchlist": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["signal", "why", "how_to_monitor"],
                    "properties": {
                        "signal": { "type": "string" },
                        "why": { "type": "string" },
                        "how_to_monitor": { "type": "string" }
                    }
                }
            },
            "sources": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["sid", "publisher", "date", "title", "url"],
                    "properties": {
                        "sid": { "type": "string" },
                        "publisher": { "type": "string" },
                        "date": { "type": "string" },
                        "title": { "type": "string" },
                        "url": { "type": "string" },
                        "note": { "type": "string" }
                    }
                }
            },
            "quality": {
                "type": "object",
                "required": ["coverage_gaps", "conflicts", "low_evidence_points"],
                "properties": {
                    "coverage_gaps": { "type": "array", "items": { "type": "string" } },
                    "conflicts": { "type": "array", "items": { "type": "string" } },
                    "low_evidence_points": { "type": "array", "items": { "type": "string" } }
                }
            }
        }
    };

    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction: systemPrompt,
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: jsonSchema as any,
        }
    });

    const userPrompt = `## 분석 대상 이슈
- **헤드라인**: ${issue.headline}
- **핵심 사실**: ${issue.keyFacts.join(', ')}
- **초기 인사이트**: ${issue.insight}

## 자료 묶음 (Context)
${context || '(추가 본문 수집 실패, 위 핵심 사실을 바탕으로 내재된 지식을 활용하여 분석하세요)'}

위 자료를 바탕으로 시스템 지침에 따라 JSON 리포트를 생성하세요.`;

    try {
        console.log('[Trend API] Gemini 분석 시작...');
        const result = await model.generateContent(userPrompt);
        const response = await result.response;
        const text = response.text();

        console.log(`[Trend API] Gemini 분석 완료 (길이: ${text.length}자)`);
        // 로깅을 위해 첫 200자만 출력 (너무 길면 로그 가독성 저하)
        console.log(`[Trend API] 응답 데이터 앞부분: ${text.substring(0, 500)}`);

        return text;
    } catch (error) {
        console.error('[Trend Report Error]', error);
        return null;
    }
}

