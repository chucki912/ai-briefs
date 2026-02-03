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

// 트렌드 센싱 리포트 (Deep Dive) 생성
export async function generateTrendReport(
    issue: IssueItem,
    context: string // Now used for extra context if any, but primary source is Google Search
): Promise<string | null> {
    const systemPrompt = `너는 산업 동향(Industry Trend Brief) 리포트를 작성하는 전문 트렌드센싱 리서치 전문가다. 
모든 리포트는 **반드시 한국어**로 작성해야 하며, 정보 밀도가 매우 높고 전략적인 관점이 담긴 "인텔리전스 리포트" 스타일을 유지한다.

[핵심 문체 지침]
- **한국어 작성 필수**: 모든 필드의 내용은 한국어로 작성한다. (기술 용어나 기업명은 원어 병기 가능)
- **고밀도 압축(High Density)**: 단순 요약이 아닌, 시장의 구조적 변화와 기술적 함의를 한 문장에 압축하여 전달한다.
- **전략적 통찰(Strategic Insight)**: "A가 B를 발표했다"는 사실 전달을 넘어, 그것이 산업 생태계(ecosystem)나 경쟁 구도에 미치는 영향을 포함한다.
- **전문 용어 활용**: Cross-Embodiment, Scaling Law, VLA, Physical Intelligence 등 최신 산업/기술 용어를 적극 활용하여 전문성을 높인다.
- **주체 선명성**: 주요 기업명, 인물, 기술 모델명을 명확히 명시한다. (예: Physical Intelligence(π²), π0 모델 등)
- **건조하고 객관적인 보고서 톤**: 수식어를 배제하고 담백하면서도 권위 있는 어조를 유지한다. (예: "진입함", "측면이 강함", "전략을 취함" 등)

[Deep Research 지침]
- **Google Search 활용**: 제공된 정보를 넘어, **Google Search 도구**를 사용하여 핵심 정보 위주로 신속하게 조사한다.
- **다각적 검증**: 3개 내외의 신뢰할 수 있는 출처를 검색하여 교차 검증한다. (Vercel Timeout 방지를 위해 과도한 검색 지양)
- **최신성 확보**: 리포트 생성 시점(Generated At) 기준 가장 최신의 업데이트 내용을 반영한다.

[메타데이터 가이드]
- **time_window**: 분석 대상 기사들이 다루는 시점을 명시한다. (예: "2026년 2월") 반드시 사용자 프롬프트에서 제공된 현재 날짜 정보를 참고하여 정확하게 작성한다.
- **generated_at**: 리포트가 생성된 정확한 시간을 ISO 8601 형식으로 작성한다.

[출력 규칙]
- 최종 출력은 정의된 JSON Schema를 만족하는 1개의 객체여야 한다.
- 필드 내 텍스트는 마크다운 형식을 쓰지 말고 일반 텍스트로만 작성한다.
- **출처(Sources)**: Google Search를 통해 발견한 실제 출처를 \`sources\` 배열에 포함하고, 본문에서 \`citations\`로 참조한다.`;

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
        model: 'gemini-3-pro-preview',
        systemInstruction: systemPrompt,
        tools: [{ googleSearch: {} } as any], // Enable Google Search Grounding (cast to any for TS)
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: jsonSchema as any,
        }
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
위 이슈에 대해 **Google Search를 사용하여 심층 조사(Deep Research)**를 수행하고, 확보된 최신 정보를 바탕으로 포괄적이지만 간결한 인텔리전스 리포트를 작성해줘.
(Vercel 함수 제한 시간을 고려하여, 불필요한 서술을 줄이고 핵심 위주로 빠르게 작성할 것)
기존에 알고 있는 지식뿐만 아니라, **반드시 검색 결과**를 근거로 사용하여 분석의 깊이와 신뢰도를 확보해야 한다.`;

    try {
        console.log('[Trend API] Gemini Deep Research 분석 시작...');
        const result = await model.generateContent(userPrompt);
        const response = await result.response;
        const text = response.text();

        console.log(`[Trend API] Gemini 분석 완료 (길이: ${text.length}자)`);

        // Grounding Metadata 로깅 (검색이 실제로 수행되었는지 확인)
        const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
        if (groundingMetadata) {
            console.log('[Trend API] Grounding Metadata found:', JSON.stringify(groundingMetadata, null, 2));
        }

        return text;
    } catch (error) {
        console.error('[Trend Report Error]', error);
        return null;
    }
}
