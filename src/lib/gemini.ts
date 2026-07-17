import { GoogleGenerativeAI } from '@google/generative-ai';
import { NewsItem, IssueItem, SourceRef, KeyFactStructured, KeyInsightStructured, SoWhatV2 } from '@/types';
import { matchFrameworks, getFrameworkNames } from './analyzers/framework-matcher';
import { ensureValidKeyInsight, logKeyInsightResult, type ValidatedKeyInsightResult } from './analyzers/key-insight';
import { recordKeyInsightMetrics } from './analyzers/key-insight-metrics';
import { ISSUE_RESPONSE_SCHEMA, buildIssuePrompt } from './generators/issue-schema';
import { checkCard, SOURCE_POLICY, c13_highRequiresBinding, c14_minDistinctOutlets } from './analyzers/structured-checks';
import { getRecentIssues } from './store';
import { FLASH_MODEL } from './gemini-models';
import { generateStructuredDeepDive, generateWithRetry, AI_DEEP_DIVE_DOMAIN, type TrendReportResult } from './deep-dive-pipeline';

// Gemini API 클라이언트 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// 뉴스 분석 및 인사이트 생성
export async function analyzeNewsAndGenerateInsights(
    newsItems: NewsItem[]
): Promise<IssueItem[]> {
    const model = genAI.getGenerativeModel({ model: FLASH_MODEL });

    // 뉴스를 관련 주제별로 클러스터링
    const clusters = clusterNewsByTopic(newsItems);

    // 중복 방지를 위한 최근 이슈 조회 (지난 3일치)
    const recentIssues = await getRecentIssues(3);
    console.log(`[Deduplication] Loaded ${recentIssues.length} recent issues for comparison.`);

    const issues: IssueItem[] = [];

    // 최대 5개 이슈만 생성
    const topClusters = clusters.slice(0, 5);

    for (const cluster of topClusters) {
        try {
            // 중복 체크 1단계: 헤드라인 유사도 (빠른 필터링)
            const clusterHeadline = cluster[0].title;
            const isPotentialDupe = recentIssues.some(issue =>
                calculateSimilarity(issue.headline, clusterHeadline) > 0.6
            );

            if (isPotentialDupe) {
                console.log(`[Deduplication] Skipping likely duplicate cluster: ${clusterHeadline}`);
                continue;
            }

            const issue = await generateIssueFromCluster(model, cluster, recentIssues);
            if (issue) {
                // 중복 체크 2단계: 생성된 이슈 내용 기반 정밀 체크 (AI 활용 가능하나 비용 절감 위해 키워드/소스 매칭 사용)
                const isDuplicate = await checkDuplicateIssues(issue, recentIssues);
                if (isDuplicate) {
                    console.log(`[Deduplication] Discarded duplicate issue: ${issue.headline}`);
                    continue;
                }
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
// onKeyInsight: Key Insight 검증/재생성 결과를 관찰하기 위한 선택적 훅(평가/집계용). 프로덕션 호출부는 미전달.
export async function generateIssueFromCluster(
    model: ReturnType<typeof genAI.getGenerativeModel>,
    cluster: NewsItem[],
    recentIssues: IssueItem[] = [],
    onKeyInsight?: (r: ValidatedKeyInsightResult) => void
): Promise<IssueItem | null> {
    const primaryNews = cluster[0];
    const frameworks = matchFrameworks(primaryNews.title, primaryNews.description);

    // 소스 참조(fact 결박 대상, R2) — 카드 단위 flat sources 폐기
    const sourceRefs: SourceRef[] = cluster.map((n, i) => ({
        id: `s${i + 1}`,
        url: n.url,
        outlet: n.source,
        title: n.title,
        publishedAt: n.publishedAt instanceof Date ? n.publishedAt.toISOString() : undefined,
        resolved: !/news\.google\.com/.test(n.url), // Google 리다이렉트는 미해석(R4 나이브 0%)
    }));
    // 뉴스 리스트에 인덱스 부여 (sourceIndices가 이 번호를 참조)
    const indexedNews = cluster.map((n, i) => `[${i + 1}] ${n.title} — ${n.source || ''}`).join('\n');
    const frameworkLines = frameworks.length
        ? frameworks.map(f => `- ${f.name}: ${f.insightTemplate}`).join('\n')
        : '지정된 렌즈 없음(none). 프레임워크를 언급하지 말고 사실 기반으로만 분석할 것.';

    const recentContextStr = recentIssues.length > 0
        ? recentIssues.map(issue => `- [${issue.headline}]\n  인사이트 요약: ${issue.insight.substring(0, 100)}...`).join('\n')
        : '이전 브리프 내용 없음';

    const today = new Date().toISOString().slice(0, 10);
    const prompt = buildIssuePrompt(indexedNews, frameworkLines, recentContextStr, today);

    try {
        // responseSchema로 구조화 출력 강제 (정규식 파싱 폐기). 전달받은 model의 클라이언트를 그대로 사용.
        const result = await generateWithRetry(model, {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema: ISSUE_RESPONSE_SCHEMA as any },
        });
        const parsed = JSON.parse((await result.response).text());

        // keyFacts: sourceIndices([n], 1-based) → sourceRef.id 결박 (R2)
        const rawFacts: KeyFactStructured[] = (Array.isArray(parsed.keyFacts) ? parsed.keyFacts : []).map((f: any, i: number) => {
            const idxs: number[] = Array.isArray(f?.sourceIndices) ? f.sourceIndices : [];
            const sourceIds = idxs.map(n => sourceRefs[n - 1]?.id).filter((x): x is string => !!x);
            return { id: `f${i + 1}`, text: String(f?.text || '').trim(), sourceIds, publishedAt: f?.publishedAt || undefined };
        });

        // AN: C2 하드 실패 — 미해석(Google 등) 소스에만 결박된 fact는 폐기(거짓 귀속 방지, 312 날조보다 정직한 사망)
        const resolvedRefIds = new Set(sourceRefs.filter(s => s.resolved !== false).map(s => s.id));
        const structuredFacts: KeyFactStructured[] = rawFacts
            .map(f => ({ ...f, sourceIds: f.sourceIds.filter(id => resolvedRefIds.has(id)) }))
            .filter(f => f.sourceIds.length >= 1);
        if (structuredFacts.length < SOURCE_POLICY.MIN_SOURCED_FACTS) {
            console.warn(`[C2 hard-fail] "${parsed.headline}": 해석된 소스에 결박된 fact ${structuredFacts.length} < ${SOURCE_POLICY.MIN_SOURCED_FACTS} → 카드 폐기(미해석 소스 과다)`);
            // 부검 덤프: 사인 판정용(BA). 원시 sourceIndices → 매핑된 id → resolved 필터 후를 단계별로 남긴다.
            for (let i = 0; i < rawFacts.length; i++) {
                const rawIdxs = Array.isArray(parsed.keyFacts?.[i]?.sourceIndices) ? parsed.keyFacts[i].sourceIndices : [];
                const afterResolve = rawFacts[i].sourceIds.filter(id => resolvedRefIds.has(id));
                console.warn(`[C2 autopsy] f${i + 1} "${rawFacts[i].text.slice(0, 70)}" 원시indices=[${rawIdxs.join(',')}] (클러스터 ${sourceRefs.length}건) → 유효id=[${rawFacts[i].sourceIds.join(',')}] → resolved후=[${afterResolve.join(',')}]`);
            }
            console.warn(`[C2 autopsy] refs: ${sourceRefs.map(s => `${s.id}=${s.outlet || s.url || '?'}${s.resolved === false ? '(미해석)' : ''}`).join(' ')}`);
            return null;
        }
        const survivingIds = new Set(structuredFacts.map(f => f.id));
        const cleanedFacts = structuredFacts.map(f => f.text);

        // keyInsight: restsOnFactIndices(1-based) → fact.id
        const kiRaw = parsed.keyInsight || {};
        // AW / AR 규칙 (a): insight가 (C2로) 폐기된 fact를 하나라도 근거로 삼으면 카드 폐기.
        //   silent 필터(폐기 참조만 지우고 발행)는 '지운 근거 위에 선 판단'을 내보낸다 —
        //   271이 소스를 사후에 갈아엎던 것과 같은 구조. 정직한 사망을 택한다(AF 철학).
        const restsOnRawIds: string[] = (Array.isArray(kiRaw.restsOnFactIndices) ? kiRaw.restsOnFactIndices : [])
            .map((n: number) => rawFacts[n - 1]?.id).filter((x: any): x is string => !!x);
        const droppedRestsOn = restsOnRawIds.filter(id => !survivingIds.has(id));
        if (droppedRestsOn.length > 0) {
            console.warn(`[AR hard-fail] "${parsed.headline}": keyInsight가 폐기된 fact(${droppedRestsOn.join(',')}) 위에 섬 → 카드 폐기`);
            return null;
        }
        const restsOnFactIds = restsOnRawIds; // 전부 생존 fact(폐기 참조가 있었으면 위에서 이미 사망)

        // Key Insight 가드레일 검증 + 치명 위반 시 최대 1회 재생성 (insight 텍스트에 적용)
        const kiResult = await ensureValidKeyInsight(
            String(kiRaw.text || ''),
            { facts: cleanedFacts, title: parsed.headline, audience: parsed.category },
            async (regenPrompt: string) => (await (await generateWithRetry(model, regenPrompt)).response).text(),
        );
        logKeyInsightResult(`Key Insight (${parsed.headline})`, kiResult);
        await recordKeyInsightMetrics(kiResult, 'ai');
        if (onKeyInsight) onKeyInsight(kiResult);

        const keyInsight: KeyInsightStructured = {
            text: kiResult.insight,
            claimType: 'inferred',
            restsOnFactIds,
            confidence: (['high', 'medium', 'low'].includes(kiRaw.confidence) ? kiRaw.confidence : 'medium'),
            mundaneAlternative: String(kiRaw.mundaneAlternative || ''),
        };

        // soWhat V2 + legacy 4분면 파생
        const swRaw = parsed.soWhat || {};
        const soWhatV2: SoWhatV2 = {
            ifInferenceHolds: String(swRaw.ifInferenceHolds || ''),
            unknown: String(swRaw.unknown || ''),
            actionType: (['act', 'observe', 'none'].includes(swRaw.actionType) ? swRaw.actionType : 'none'),
            action: swRaw.actionType === 'act' ? swRaw.action : undefined,
            observe: swRaw.actionType === 'observe' ? swRaw.observe : undefined,
            killTrigger: String(swRaw.killTrigger || ''),
        };
        const legacySoWhat = {
            ifTrue: soWhatV2.ifInferenceHolds,
            uncertain: soWhatV2.unknown,
            bet: soWhatV2.action?.what || soWhatV2.observe?.metric || '지금 실행할 행동 없음(관망)',
            downside: soWhatV2.action?.costIfWrong || soWhatV2.action?.costIfMissed || '—',
        };

        // 소스: fact가 실제 결박한 것만 (271 헤드라인 필터 + 312 cluster[0] 날조 폐기)
        const usedIds = new Set(structuredFacts.flatMap(f => f.sourceIds));
        const usedRefs = sourceRefs.filter(s => usedIds.has(s.id));

        // C14 하드 실패: 단일 매체에만 근거한 카드는 내보내지 않는다(무조건부 outlet 하한, 원본 카드3 재발 방지).
        const c14 = c14_minDistinctOutlets(usedRefs);
        if (c14.length) {
            console.warn(`[C14 hard-fail] "${parsed.headline}": ${c14[0].message} → 카드 폐기`);
            return null;
        }
        // C13 하드 실패: 자기신고 high는 결박(restsOn fact 수·outlet 다양성)으로 자격을 증명해야 한다.
        const c13 = c13_highRequiresBinding(keyInsight, structuredFacts, usedRefs);
        if (c13.length) {
            console.warn(`[C13 hard-fail] "${parsed.headline}": ${c13[0].message} → 카드 폐기`);
            return null;
        }

        const issue: IssueItem = {
            headline: parsed.headline,
            thesis: parsed.thesis,
            singleTopicStatement: parsed.thesis, // legacy alias(병합)
            oneLineSummary: parsed.thesis, // legacy alias(병합)
            category: parsed.category,
            excludedFacts: parsed.excludedFacts || [],
            hashtags: parsed.hashtags,
            keyFacts: cleanedFacts, // legacy 파생
            structuredFacts,
            sourceRefs: usedRefs,
            keyInsight,
            insight: keyInsight.text, // legacy 파생
            confidence: keyInsight.confidence,
            soWhatV2,
            soWhat: legacySoWhat, // legacy 파생
            framework: getFrameworkNames(frameworks),
            sources: usedRefs.map(s => s.url), // legacy 파생 (빈 배열이면 C1이 잡음, cluster[0] 날조 안 함)
            clusterSize: cluster.length, // 사전태그(임계값 아님): size 하한 논의 재개 시 데이터로 쓰기 위한 기록
        };

        // 구조 체크 (C1/C2/C4/C5/C9'/C10/C11/C12)
        const cardCheck = checkCard(issue);
        if (cardCheck.hasError) {
            console.warn(`[Structured Check] "${parsed.headline}": ${cardCheck.issues.map(i => `${i.code}`).join(', ')}`);
        }

        return issue;
    } catch (error) {
        console.error('[Issue Generation Error]', error);
        return null;
    }
}

// 중복 이슈 체크 로직
export async function checkDuplicateIssues(newIssue: IssueItem, history: IssueItem[]): Promise<boolean> {
    if (history.length === 0) return false;

    // 1. 소스 URL 중복 체크 (가장 확실함)
    // 새로운 이슈의 소스가 기존 이슈의 소스와 50% 이상 겹치면 중복
    const newSources = new Set(newIssue.sources || []);

    for (const oldIssue of history) {
        const oldSources = new Set(oldIssue.sources || []);
        if (newSources.size === 0 || oldSources.size === 0) continue;

        const intersection = [...newSources].filter(x => oldSources.has(x));
        const overlapRatio = intersection.length / Math.min(newSources.size, oldSources.size);

        if (overlapRatio >= 0.5) {
            console.log(`[Deduplication] Source overlap ${Math.round(overlapRatio * 100)}% with "${oldIssue.headline}"`);
            return true;
        }

        // 2. 헤드라인 유사도 체크 (Jaccard Similarity of keywords)
        const sim = calculateSimilarity(newIssue.headline, oldIssue.headline);
        if (sim > 0.7) {
            console.log(`[Deduplication] Headline similarity ${sim.toFixed(2)} with "${oldIssue.headline}"`);
            return true;
        }

        // 3. AI Semantic Check (Fallback for semantic duplicates)
        // 키워드 유사도가 낮아도(0.2~0.7) 의미적으로 동일할 수 있음 (예: "Stock Hits High" vs "Shares Record")
        if (sim > 0.2) {
            const isSemanticDupe = await checkSemanticDuplicate(newIssue, oldIssue);
            if (isSemanticDupe) return true;
        }
    }
    return false;
}

// 3. AI 기반 의미론적 유사도 체크 (키워드 매칭이 애매한 경우)
async function checkSemanticDuplicate(newIssue: IssueItem, oldIssue: IssueItem): Promise<boolean> {
    try {
        const model = genAI.getGenerativeModel({ model: FLASH_MODEL });
        const prompt = `
        Compare these two news issues and determine if they describe the exact same core event or announcement. 
        Ignore minor differences in details or perspective.

        Issue A: "${newIssue.headline}"
        Key Facts A: ${newIssue.keyFacts.join(', ')}
        
        Issue B: "${oldIssue.headline}"
        Key Facts B: ${oldIssue.keyFacts.join(', ')}
        
        Are they referring to the same event? Answer strictly with "YES" or "NO".
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim().toUpperCase();

        if (text.includes("YES")) {
            console.log(`[Deduplication] AI Semantic Match: "${newIssue.headline}" == "${oldIssue.headline}"`);
            return true;
        }
        return false;
    } catch (e) {
        console.error("Semantic check failed", e);
        return false;
    }
}

// 간단한 키워드 기반 유사도 (Jaccard Similarity)
export function calculateSimilarity(str1: string, str2: string): number {
    const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s가-힣]/g, '').split(/\s+/).filter(w => w.length > 1);
    const set1 = new Set(normalize(str1));
    const set2 = new Set(normalize(str2));

    if (set1.size === 0 || set2.size === 0) return 0;

    const intersection = [...set1].filter(x => set2.has(x));
    return intersection.length / (set1.size + set2.size - intersection.length); // Jaccard Index
}

// API 연결 테스트 function
export async function checkGeminiConnection(): Promise<boolean> {
    try {
        const model = genAI.getGenerativeModel({ model: FLASH_MODEL });
        const result = await model.generateContent('Hello');
        const response = await result.response;
        console.log('[Gemini Connection Test Success]:', response.text().slice(0, 20) + '...');
        return true;
    } catch (error) {
        console.error('[Gemini Connection Test Failed]', error);
        return false;
    }
}

// API 연결 테스트
export async function testGeminiConnection(): Promise<boolean> {
    try {
        const model = genAI.getGenerativeModel({ model: FLASH_MODEL });
        const result = await model.generateContent('Hello');
        const response = await result.response;
        return !!response.text();
    } catch (error) {
        console.error('[Gemini Connection Test Failed]', error);
        return false;
    }
}

// ── Deep Dive (v3 구조화 파이프라인) ─────────────────────────────────────────
// 파이프라인 본체·게이트·프롬프트 골격은 deep-dive-pipeline.ts 단일 위치 —
// 이 함수는 AI 도메인 config(AI_DEEP_DIVE_DOMAIN)를 넘기는 얇은 래퍼임.
export type { TrendReportResult } from './deep-dive-pipeline';

export async function generateTrendReport(
    issue: IssueItem,
    context: string // Kept for compatibility
): Promise<TrendReportResult | null> {
    return generateStructuredDeepDive(issue, context, AI_DEEP_DIVE_DOMAIN);
}
