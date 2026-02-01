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
    const systemPrompt = `너는 산업 동향(Industry Trend Brief) 리포트를 작성하는 전문 트렌드센싱 리서치 전문가다. 
모든 리포트는 **반드시 한국어**로 작성해야 하며, 정보 밀도가 매우 높고 전략적인 관점이 담긴 "인텔리전스 리포트" 스타일을 유지한다.

[핵심 문체 지침]
- **한국어 작성 필수**: 모든 필드의 내용은 한국어로 작성한다. (기술 용어나 기업명은 원어 병기 가능)
- **고밀도 압축(High Density)**: 단순 요약이 아닌, 시장의 구조적 변화와 기술적 함의를 한 문장에 압축하여 전달한다.
- **전략적 통찰(Strategic Insight)**: "A가 B를 발표했다"는 사실 전달을 넘어, 그것이 산업 생태계(ecosystem)나 경쟁 구도에 미치는 영향을 포함한다.
- **전문 용어 활용**: Cross-Embodiment, Scaling Law, VLA, Physical Intelligence 등 최신 산업/기술 용어를 적극 활용하여 전문성을 높인다.
- **주체 선명성**: 주요 기업명, 인물, 기술 모델명을 명확히 명시한다. (예: Physical Intelligence(π²), π0 모델 등)
- **건조하고 객관적인 보고서 톤**: 수식어를 배제하고 담백하면서도 권위 있는 어조를 유지한다. (예: "진입함", "측면이 강함", "전략을 취함" 등)

[섹션별 작성 가이드]
1. **Executive Summary**: 
   - 개별 뉴스 나열이 아닌, 전체 상황을 관통하는 3-4개의 핵심 레이어(layer)를 추출한다. 
   - 시장 선점, 기술적 부상, 생태계 진입 등 전략적 키워드 중심.
2. **Key Developments**:
   - 각 개발 항목은 논리적 완결성을 가져야 하며, (Fact)와 (Analysis)를 엄격히 구분하여 작성한다. 
   - Analysis에서는 해당 사실의 배경이나 잠재적 파급 효과를 설명한다.
3. **Implications**:
   - Market, Tech, Comp, Policy 4개 영역으로 나누어 구조적 변화를 분석한다.
   - 단기 현상보다 중장기적인 방향성을 제시한다.

[출력 규칙]
- 최종 출력은 정의된 JSON Schema를 만족하는 1개의 객체여야 한다.
- 필드 내 텍스트는 마크다운 형식을 쓰지 말고 일반 텍스트로만 작성한다.`;

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

