// Battery Industry Gemini Analyzer
// 배터리 산업 전용 분석기 (K-Battery 관점)

import { GoogleGenerativeAI } from '@google/generative-ai';
import { NewsItem, IssueItem, KeyFactStructured } from '@/types';
import { BATTERY_CONFIG } from '@/configs/battery';
import { getRecentIssues } from './store';
import { checkDuplicateIssues, calculateSimilarity } from './gemini';
import { KEY_INSIGHT_FIELD_SPEC, KEY_INSIGHT_GUIDE, KEY_INSIGHT_CHECKLIST, ensureValidKeyInsight, logKeyInsightResult } from './analyzers/key-insight';
import { recordKeyInsightMetrics } from './analyzers/key-insight-metrics';
import { bindEvidence, c19_textYearMatchesValue } from './analyzers/structured-checks';
import { repairFactYears } from './analyzers/fact-year-repair';
import { recordTemporalMetrics } from './analyzers/temporal-metrics';
import { FLASH_MODEL } from './gemini-models';
import { generateStructuredDeepDive, generateWithRetry, BATTERY_DEEP_DIVE_DOMAIN, type TrendReportResult } from './deep-dive-pipeline';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// 배터리 뉴스 분석 및 인사이트 생성
export async function analyzeBatteryNewsAndGenerateInsights(
    newsItems: NewsItem[]
): Promise<IssueItem[]> {FLASH_MODEL
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    // 뉴스를 관련 주제별로 클러스터링
    const clusters = clusterBatteryNewsByTopic(newsItems);

    // 중복 방지를 위한 최근 이슈 조회 (지난 3일치)
    const recentIssues = await getRecentIssues(3);
    console.log(`[Battery Deduplication] Loaded ${recentIssues.length} recent issues for comparison.`);

    const issues: IssueItem[] = [];

    // 최대 5개 이슈만 생성
    const topClusters = clusters.slice(0, 5);

    for (const cluster of topClusters) {
        try {
            // 중복 체크 1단계: 헤드라인 유사도 (빠른 필터링)
            const isPotentialDupe = recentIssues.some(issue =>
                calculateSimilarity(issue.headline, cluster[0].title) > 0.6
            );

            if (isPotentialDupe) {
                console.log(`[Battery Dupe] Skipping likely duplicate cluster: ${cluster[0].title}`);
                continue;
            }

            const issue = await generateBatteryIssueFromCluster(model, cluster);
            if (issue) {
                // 중복 체크 2단계: 정밀 체크
                const isDuplicate = await checkDuplicateIssues(issue, recentIssues);
                if (isDuplicate) {
                    console.log(`[Battery Dupe] Discarded duplicate issue: ${issue.headline}`);
                    continue;
                }
                issues.push(issue);
            }
        } catch (error) {
            console.error('[Battery Gemini Error]', error);
        }
    }

    return issues;
}

// 배터리 주제별 뉴스 클러스터링
function clusterBatteryNewsByTopic(newsItems: NewsItem[]): NewsItem[][] {
    const clusters = new Map<string, NewsItem[]>();

    const keyTerms = [
        // 기업 (우선순위)
        'CATL', 'BYD', 'Tesla', 'Panasonic', 'Samsung SDI', 'SK On',
        'Albemarle', 'SQM', 'Ganfeng', 'BASF',
        // 기술
        'LFP', 'NCM', 'NCA', 'Solid-State', 'Sodium-ion', 'Lithium-metal',
        // 소재
        'Lithium', 'Nickel', 'Cobalt', 'Graphite', 'Manganese',
        // 응용
        'EV', 'ESS', 'Grid Storage',
        // 정책
        'IRA', 'CRMA', 'Tariff', 'Subsidy', 'Regulation'
    ];

    for (const item of newsItems) {
        let cluster = 'Global Battery Trends';
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

    // 크기순 정렬
    return Array.from(clusters.values())
        .sort((a, b) => b.length - a.length);
}

// 클러스터에서 배터리 이슈 생성
async function generateBatteryIssueFromCluster(
    model: ReturnType<typeof genAI.getGenerativeModel>,
    cluster: NewsItem[]
): Promise<IssueItem | null> {
    const primaryNews = cluster[0];

    // 해당 뉴스에 맞는 프레임워크 매칭
    const matchedFrameworks = matchBatteryFrameworks(primaryNews.title, primaryNews.description);

    // 뉴스 리스트에 인덱스 부여
    // 본문 스니펫 포함 — factAssertedAt.evidence(시점 원문 인용)를 뽑을 수 있도록.
    const indexedNews = cluster.map((n, i) => `[${i + 1}] 제목: ${n.title}\n    ${(n.description || '').slice(0, 300)}\n출처: ${n.url}`).join('\n\n');
    const sourceText = cluster.map(n => `${n.title} ${n.description || ''}`).join('\n');
    // current 사실 발행일 앵커용: 클러스터 최신 발행일(ISO) 또는 null
    const clusterLatestPub = cluster
        .map(n => (n.publishedAt instanceof Date ? n.publishedAt.toISOString() : null))
        .filter((x): x is string => !!x)
        .sort()
        .pop() ?? null;

    const prompt = `${BATTERY_CONFIG.promptContext}

## 뉴스 클러스터 정보 (인덱스 부여됨)
${indexedNews}

## 적용 분석 프레임워크
${matchedFrameworks.map(f => `- ${f.name}: ${f.insightTemplate}`).join('\n')}

## 출력 형식 (JSON)
{
  "headline": "한국어 헤드라인 (30자 이내, 단일 핵심 주제 중심)",
  "category": "적절한 카테고리 (영어)",
  "oneLineSummary": "이 카드가 주장하는 단일 논지(Thesis) 1문장 (100자 이내). 요약이 아닌 핵심 주장 명제여야 하며 팩트의 단순 나열을 금지함.",
  "hashtags": ["#키워드1", "#키워드2", "#키워드3"],
  "keyFacts": [
    "핵심 사실 1 (구체적 수치/기업명 포함, 예: CapEx $20B 투자 발표)",
    "핵심 사실 2",
    "핵심 사실 3"
  ],
  "keyFactsMeta": [
    { "factAssertedAt": { "value": "YYYY-MM 또는 YYYY 또는 unknown", "evidence": "원문에서 시점을 명시한 구절 인용, 없으면 빈 문자열" }, "temporalRole": "current 또는 background" },
    { "factAssertedAt": { "value": "...", "evidence": "..." }, "temporalRole": "..." },
    { "factAssertedAt": { "value": "...", "evidence": "..." }, "temporalRole": "..." }
  ],
  "insight": "${KEY_INSIGHT_FIELD_SPEC} (기업 영향·경영진 대응은 K-Battery 생태계(LGES, SK On, SDI, 소재사 등) 관점에서 구체화할 것.)",
  "soWhat": {
    "ifTrue": "이 신호가 사실이라면 K-Battery 생태계 관점에서 무엇이 바뀌는가 (완성형 1문장)",
    "uncertain": "아직 검증되지 않았거나 주시해야 할 핵심 변수 (완성형 1문장)",
    "bet": "지금 시점의 합리적 베팅/대응 방향 — 구체적 주어 포함 (완성형 1문장)",
    "downside": "그 베팅이 틀렸을 때 감수해야 할 비용 또는 하방 리스크 (완성형 1문장)"
  },
  "relevantSourceIndices": [1, 2]
}

## 작성 규칙
- 100% 한국어 (기업명/전문용어는 영문 병기)
- **모든 출력 내용(headline, category, oneLineSummary, keyFacts 등)은 반드시 명사형 종결어미(~함, ~임, ~전망 등)를 사용하는 '개조식 축약 문체'로 작성할 것. 단, insight 및 soWhat의 각 필드는 인과가 흐르는 완성형 문장으로 작성할 것. 서술어 철저히 배제.**
- **단일 주제 집중 (Strictly Single Topic)**: 하나의 브리프 카드는 반드시 하나의 구체적이고 명확한 주제(예: 특정 리튬 가격 변동, 특정 기업의 합작사 설립 등)만 다루어야 합니다. 서로 다른 여러 소식을 병렬로 나열하지 마세요.
- **중요**: \`relevantSourceIndices\` 필드에는 이 브리핑과 직접 관련된 핵심 기사 번호만 정수 배열로 포함하세요.
- **핵심 사실 (Key Facts)**: 반드시 **정확히 3개의 핵심 사실**을 도출하여 \`keyFacts\` 배열에 담으세요. 4개 이상의 사실이 섞이지 않도록 가장 중요한 3개만 선별하세요. 중복 방지를 위해 keyFacts 작성 시 헤드라인, oneLineSummary(논지) 및 insight(시사점)의 내용을 반복하여 재진술하지 마십시오. 오직 객관적 팩트와 수치 데이터 전달에 집중해야 합니다.
- **출처·검증 태그 금지**: keyFacts 각 문장 끝에 \`(Yahoo Finance, 2026년 7월 / 검증됨)\`, \`(... / 미검증)\`, \`(... 기준 / 신뢰도 보통)\` 같은 출처명·시점·신뢰도 꼬리표를 절대 붙이지 마십시오. 출처는 하단 Sources 링크로만 제공합니다. 팩트 문장은 순수하게 사실만 서술하고 괄호 태그로 마무리하지 마십시오.
- **시점 판정 (keyFactsMeta, keyFacts와 같은 순서·개수로 필수)**:
  - **단일 사건·단일 시점**: 한 keyFact는 하나의 사건·하나의 시점만. 서로 다른 시점의 사건(예: "2024년 파운드리 폐쇄"와 "2026년 TV 생산중단")을 한 문장에 병합하지 말고 별개 keyFact로 분리할 것.
  - **시점 규칙(필드와 텍스트에 동일 적용)**: \`factAssertedAt.value\`는 시점 "YYYY-MM"/"YYYY", \`evidence\`는 **원문에서 그 시점을 명시한 구절 인용**. **시점 근거가 없으면 value는 "unknown"·evidence는 빈 문자열이고, 동시에 keyFacts 문장에도 연도를 쓰지 않는다(시점 없이 서술).** value가 특정 연도면 문장의 연도도 그 값과 일치시킨다. 필드는 unknown인데 문장엔 "2026년"을 쓰는 식으로 나눠 적용 금지 — 독자가 보는 것은 문장이다. 추측·역산·상식 보완 금지. 기사 발행일이 곧 시점인 current 사실은 unknown으로 두면 코드가 발행일로 앵커함.
  - \`temporalRole\`: 이번 뉴스의 **새 전개**면 \`current\`, 기사가 인용한 **과거 맥락/배경**(2024년 등 과거 수치)이면 \`background\`.
  - **background 시점 문장 표기(필수)**: temporalRole이 background인 사실은 keyFacts의 그 문장 안에 **원문에 근거한 절대 연도를 명시**할 것(예: "2024년 …"). 근거 없으면 background로 분류하지 말 것. "작년/지난해" 상대표현 금지.
  - **unknown 수치 근거 금지**: value가 unknown인 사실의 수치를 insight/soWhat의 확정 근거로 쓰지 마십시오.
- **심층 인사이트(Key Insight) 및 soWhat (★판단형 의사결정 체계 적용★)**:
${KEY_INSIGHT_GUIDE}
  - 여기서 '기업'은 우선적으로 한국 배터리 생태계(LGES, SK On, SDI, 소재사 등)를 뜻합니다. 다만 근거 없이 특정국·특정사의 의도를 단정하지 말고 구조적 결과로 서술하십시오.
  - soWhat은 위 Key Insight를 실행 관점에서 분해하는 상세 매트릭스입니다. 4가지 필드(ifTrue, uncertain, bet, downside)를 각각 완성형 1문장으로 작성하고, bet에 구체적 주어를 명시하되 insight의 경영진 대응 문장을 그대로 복제하지 마십시오.
- 객관적 수치, 공식 발언 기반 서술 (수치 데이터가 있다면 반드시 포함)
- 감정적 표현 배제 (드라이하고 전문적인 톤 유지)

## 자체 검증 체크리스트 (JSON 출력 전 확인, 실패 시 해당 섹션 재생성)
[ ] ${KEY_INSIGHT_CHECKLIST.join('\n[ ] ')}
[ ] soWhat 4필드가 완성형 1문장씩이고 bet에 구체적 주어가 있으며 insight 대응 문장과 중복되지 않는가?

JSON만 출력하세요.`;

    try {
        const result = await generateWithRetry(model, prompt);
        const response = await result.response;
        const text = response.text();

        // JSON 추출
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('JSON not found in response');
        }

        const parsed = JSON.parse(jsonMatch[0]);

        // 소스 필터링
        let selectedSources: string[] = [];
        if (parsed.relevantSourceIndices && Array.isArray(parsed.relevantSourceIndices)) {
            selectedSources = parsed.relevantSourceIndices
                .map((idx: number) => cluster[idx - 1]?.url)
                .filter((url: string) => url !== undefined);
        }

        // 최소 1개 소스 보장
        if (selectedSources.length === 0) {
            selectedSources = [cluster[0].url];
        }

        // Key Insight 검증 + 치명적 위반 시 최대 1회 재생성
        const kiResult = await ensureValidKeyInsight(
            parsed.insight || parsed.strategicInsight || '',
            { facts: parsed.keyFacts || [], title: parsed.headline || parsed.title, audience: parsed.category },
            async (regenPrompt: string) => {
                const r = await generateWithRetry(model, regenPrompt);
                return (await r.response).text();
            },
        );
        logKeyInsightResult(`Battery Key Insight (${parsed.headline || parsed.title})`, kiResult);
        await recordKeyInsightMetrics(kiResult, 'battery'); // 내부에서 예외를 삼킴(생성 비중단)
        const finalInsight = kiResult.insight;

        // 시점 메타(keyFactsMeta)를 keyFacts와 인덱스 정렬해 구조화(검증·지표용). 배터리는
        // fact 단위 소스 결박이 없어 sourceIds는 비움(카드 단위 sources 사용) — 시점 체크에는 무관.
        const factTexts: string[] = Array.isArray(parsed.keyFacts) ? parsed.keyFacts : [];
        const factMeta: Record<string, unknown>[] = Array.isArray(parsed.keyFactsMeta) ? parsed.keyFactsMeta : [];
        const sourcedBatteryFacts: KeyFactStructured[] = factTexts.map((t, i) => {
            const role = factMeta[i]?.temporalRole === 'background' ? 'background' as const : 'current' as const;
            // factAssertedAt {value, evidence, anchorSource}: evidence 없거나 원문에 없으면 unknown 강제.
            const faRaw = (factMeta[i]?.factAssertedAt && typeof factMeta[i].factAssertedAt === 'object')
                ? factMeta[i].factAssertedAt as Record<string, unknown> : {};
            const fa = bindEvidence(faRaw.value, faRaw.evidence, sourceText);
            // current 사실은 근거 없어도 클러스터 발행일로 앵커. anchorSource로 'quote'와 구분(주간 rule 3용).
            if (fa.value === 'unknown' && role === 'current' && clusterLatestPub) {
                fa.value = clusterLatestPub.slice(0, 7); fa.evidence = null; fa.anchorSource = 'sourcePublishedAt';
            }
            return {
                id: `f${i + 1}`,
                text: String(t || '').trim(),
                sourceIds: [],
                factAssertedAt: fa,
                temporalRole: role,
            };
        });
        // C19: 텍스트 연도-필드 결속 재생성/폐기. 렌더되는 keyFacts는 이 repaired 텍스트에서 파생해야 함.
        const structuredFacts = await repairFactYears(sourcedBatteryFacts, async p => (await (await generateWithRetry(model, p)).response).text());
        // 배터리 insight는 평문(restsOn 결박 없음) → c16(unknown 정량 근거)는 미적용, 분포만 기록.
        await recordTemporalMetrics(structuredFacts, undefined, 'battery');
        const bc19 = c19_textYearMatchesValue(structuredFacts);
        if (bc19.length) console.warn(`[Battery Temporal Check] "${parsed.headline || parsed.title}": c19 잔여 ${bc19.length} — ${bc19[0].message}`);

        return {
            headline: parsed.headline || parsed.title,
            category: parsed.category,
            oneLineSummary: parsed.oneLineSummary,
            hashtags: parsed.hashtags,
            keyFacts: structuredFacts.map(f => f.text), // 렌더 소스 — repaired 텍스트에서 파생(오연도 차단)
            structuredFacts,
            insight: finalInsight,
            framework: matchedFrameworks.map(f => f.name).join(', '),
            sources: selectedSources,
            soWhat: parsed.soWhat,
        };
    } catch (error) {
        console.error('[Battery Issue Generation Error]', error);
        return null;
    }
}

// 배터리 프레임워크 매칭
function matchBatteryFrameworks(title: string, description: string) {
    const content = (title + ' ' + description).toLowerCase();

    return BATTERY_CONFIG.analysisFrameworks.filter(framework =>
        framework.triggerKeywords.some(kw => content.includes(kw.toLowerCase()))
    ).slice(0, 2); // 최대 2개 프레임워크
}

// ── 배터리 Deep Dive (v3 구조화 파이프라인) ──────────────────────────────────
// 구 K-Battery Survival Strategy 프롬프트(Basis 라벨 부착 체계 포함)는 v3 전환으로 소멸 —
// 파이프라인 본체는 deep-dive-pipeline.ts 단일 위치, 이 함수는 배터리 도메인 config를 넘기는 얇은 래퍼임.
export async function generateBatteryTrendReport(
    issue: IssueItem,
    context: string // Kept for compatibility
): Promise<TrendReportResult | null> {
    return generateStructuredDeepDive(issue, context, BATTERY_DEEP_DIVE_DOMAIN);
}
