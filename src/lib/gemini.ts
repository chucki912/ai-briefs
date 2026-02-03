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

// ... (testGeminiConnection)

// 1단계: Deep Research (Flash 모델 사용 - 속도 최적화)
export async function performDeepResearch(issue: IssueItem): Promise<any | null> {
    const systemPrompt = `너는 최고의 AI 트렌드 리서처다.
주어진 이슈에 대해 **Google Search**를 사용하여 심층 정보를 수집하고, 다음 단계의 "리포트 작성자"가 사용할 수 있는 **상세한 조사 노트(Research Context)**를 작성하라.

[지침]
- **모델**: 속도가 빠른 정보를 수집하는 것이 목표다.
- **검색**: 핵심 키워드 위주로 실시간 검색을 수행하라. (최소 3개 이상의 신뢰할 수 있는 소스)
- **출력**: 리포트 형식이 아니라, **팩트와 데이터 위주의 구조화된 데이터**여야 한다.

[출력 형식 (JSON)]
{
  "summary": "핵심 내용 3줄 요약",
  "key_facts": ["팩트 1", "팩트 2", ...],
  "timeline": ["날짜 - 사건", ...],
  "expert_opinions": ["전문가/기업 반응"],
  "sources": [
    { "title": "...", "url": "...", "date": "..." }
  ]
}`;

    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash', // Fast model for research
        systemInstruction: systemPrompt,
        tools: [{ googleSearch: {} } as any],
        generationConfig: {
            responseMimeType: "application/json",
        }
    });

    const userPrompt = `
## 분석 대상
- 헤드라인: ${issue.headline}
- 키워드: ${issue.keyFacts.join(', ')}

위 이슈에 대해 상세한 리서치를 수행하고 JSON으로 결과를 반환해.`;

    try {
        console.log('[Gemini] Deep Research (Flash) starting...');
        const result = await model.generateContent(userPrompt);
        const response = await result.response;
        console.log('[Gemini] Deep Research completed.');

        return JSON.parse(response.text());
    } catch (error) {
        console.error('[Research Error]', error);
        return null;
    }
}

// 2단계: 리포트 작성 (Pro 모델 사용 - 지능 최적화)
export async function synthesizeReport(issue: IssueItem, researchResult: any): Promise<string | null> {
    const systemPrompt = `너는 산업 동향(Industry Trend Brief) 리포트를 작성하는 전문 트렌드센싱 리서치 전문가다.
1단계에서 수집된 **Research Context**를 바탕으로, 최종적으로 배포될 고품질의 **인텔리전스 리포트**를 작성하라.

[핵심 문체 지침]
- **한국어 작성 필수**: 모든 내용은 한국어로 작성 (기술 용어 원어 병기).
- **고밀도 압축**: 시장의 구조적 변화와 기술적 함의를 압축적으로 전달.
- **전략적 통찰**: 단순 사실 나열이 아닌, 산업 생태계에 미치는 영향 분석.
- **건조하고 권위 있는 어조**: "진입함", "보여줌" 등 명사형/건조한 어미 사용.

[자료 활용]
- 제공된 **Research Context**의 내용을 메인으로 활용하라.
- 추가적인 일반 상식 수준의 추론은 가능하지만, **추가적인 Google Search는 수행하지 않는다** (시간 절약).
- 출처(Sources)는 Research Context에 있는 것을 그대로 인용(Citations)하라.

[출력 규칙]
- 정의된 JSON Schema를 엄격히 따를 것.`;

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
        model: 'gemini-3-pro-preview', // Pro model for synthesis
        systemInstruction: systemPrompt,
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: jsonSchema as any,
        }
    });

    const userPrompt = `
## 이슈 정보
- 헤드라인: ${issue.headline}

## Research Context (1단계 결과)
${JSON.stringify(researchResult, null, 2)}

위 Context를 바탕으로 **최종 인텔리전스 리포트**를 작성해.`;

    try {
        console.log('[Gemini] Synthesis (Pro) starting...');
        const result = await model.generateContent(userPrompt);
        const response = await result.response;
        console.log('[Gemini] Synthesis completed.');

        return response.text();
    } catch (error) {
        console.error('[Synthesis Error]', error);
        return null;
    }
}
