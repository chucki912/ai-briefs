import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { IssueItem } from '@/types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ─── Types ───────────────────────────────────────────────────────────────────
export interface IssueCluster {
    clusterName: string;
    themeDescription: string;
    issueIndices: number[];
}

// ─── 1. AI-Driven Issue Clustering ──────────────────────────────────────────
export async function clusterIssuesByAI(issues: IssueItem[], domain: 'ai' | 'battery' = 'ai'): Promise<IssueCluster[]> {
    if (issues.length === 0) return [];

    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    const issueList = issues.map((issue, idx) =>
        `[${idx}] ${issue.headline}\n    Facts: ${issue.keyFacts.slice(0, 2).join(' | ')}`
    ).join('\n');

    const domainExpert = domain === 'ai' ? 'AI/테크 산업 이슈 분류 전문가' : '글로벌 배터리 산업 전략 분석가';
    const focusItems = domain === 'ai'
        ? '모델 아키텍처, 빅테크 경쟁 구도, 규제, 반도체 공급망'
        : '공급망(Up/Mid/Downstream), 기술 로드맵(LFP/Soli-state 등), OEM 협력, 정책(IRA 등)';

    const prompt = `당신은 ${domainExpert}입니다.
아래 ${issues.length}개의 뉴스 이슈를 분석하고, **주제적 관련성이 높은 이슈끼리 클러스터**로 묶어주세요.
분석 시 특히 **[${focusItems}]** 관점에 중점을 두십시오.

## Rules
1. 각 클러스터는 최소 2개 이상의 이슈를 포함해야 합니다.
2. 단독 이슈(어떤 클러스터에도 속하지 않는 이슈)는 "기타 주요 동향" 클러스터에 묶으세요.
3. 클러스터는 최대 5개까지만 생성하세요.
4. 반드시 모든 이슈가 하나 이상의 클러스터에 포함되어야 합니다.
5. JSON만 출력하세요.

## Issues
${issueList}

## Output JSON Schema
\`\`\`json
{
  "clusters": [
    {
      "clusterName": "클러스터를 관통하는 주제명 (한글, 15자 이내)",
      "themeDescription": "이 클러스터의 핵심 테마를 한 문장으로 설명",
      "issueIndices": [0, 2, 5]
    }
  ]
}
\`\`\`

JSON만 출력하세요.`;

    try {
        const result = await generateWithRetry(model, prompt);
        const response = result.response;
        const text = response.text();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Clustering JSON not found');

        const parsed = JSON.parse(jsonMatch[0]);
        const clusters: IssueCluster[] = parsed.clusters || [];

        // Validation: ensure all indices are within bounds
        return clusters.map(c => ({
            ...c,
            issueIndices: c.issueIndices.filter(i => i >= 0 && i < issues.length),
        })).filter(c => c.issueIndices.length >= 1);

    } catch (error) {
        console.error('[Weekly Report] Clustering failed:', error);
        // Fallback: single cluster with all issues
        return [{
            clusterName: '주간 종합 동향',
            themeDescription: '최근 7일간의 주요 동향 종합 분석',
            issueIndices: issues.map((_, i) => i),
        }];
    }
}

// ─── 2. Weekly Report Generation ────────────────────────────────────────────
export async function generateWeeklyReport(
    clusters: IssueCluster[],
    allIssues: IssueItem[],
    domain: 'ai' | 'battery' = 'ai'
): Promise<string | null> {

    const domainLabel = domain === 'ai' ? '글로벌 AI 산업' : '글로벌 배터리 산업';
    const nowDate = new Date();
    const kstDateStr = nowDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const weekAgo = new Date(nowDate);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const periodLabel = `${weekAgo.toLocaleDateString('ko-KR')} ~ ${nowDate.toLocaleDateString('ko-KR')}`;

    // Build cluster context
    const clusterContext = clusters.map((cluster, cIdx) => {
        const clusterIssues = cluster.issueIndices.map(i => allIssues[i]).filter(Boolean);
        const issueDetails = clusterIssues.map((issue, iIdx) => `
      [Issue ${iIdx + 1}] ${issue.headline}
      - Key Facts: ${issue.keyFacts.join(' / ')}
      - Insight: ${issue.insight}
      - Sources: ${issue.sources?.join(', ') || '없음'}`).join('\n');

        return `
### Cluster ${cIdx + 1}: ${cluster.clusterName}
테마: ${cluster.themeDescription}
포함 이슈 수: ${clusterIssues.length}건
${issueDetails}`;
    }).join('\n\n---\n');

    const aiRole = {
        title: '글로벌 AI 산업 전략 컨설턴트',
        reasoning: `
- **Cross-Layer Connectivity**: 모델 계층(Foundation)과 애플리케이션 계층, 인프라(HW) 간의 수직적 통합 또는 분리 흐름을 포착하십시오.
- **Compute Economics**: 추론 비용, 에너지 효율, 칩 공급망이 소프트웨어 비즈니스 모델에 미치는 영향을 분석하십시오.
- **Algorithmic Frontier**: 단순한 성능 향상이 아닌, 추론 방식의 근본적 변화가 가져올 파괴적 혁신을 기술하십시오.`
    };

    const batteryRole = {
        title: '글로벌 배터리/에너지 산업 수석 전략가',
        reasoning: `
- **Value Chain Integration**: 광물 수급부타 전구체, 양극재, 셀 제조, OEM 탑재로 이어지는 밸류체인 전반의 병목을 분석하십시오.
- **Geopolitical Arb**: IRA, CRMA 등 주요국의 정책 보조금과 무역 장벽이 생산 기지 및 수익성에 미치는 실질적 영향을 계산하십시오.
- **Tech Roadmap Competition**: NCM 대비 LFP의 점유율 변화, 4680 원통형 폼팩터 도입, 전고체(Solid-state) 진영의 실질적 양산 시점 등 기술 경쟁 우위를 분석하십시오.`
    };

    const expert = domain === 'ai' ? aiRole : batteryRole;

    // Upgraded System Prompt: Expert Weekly Insight Edition (v2 — 7 Defect Fixes)
    const systemPrompt = `# Antigravity Prompt — 주간 심층 전략 리포트 (Expert Weekly Insight Edition)

## Role
당신은 20년 경력의 '${expert.title}'이자 '데이터 사이언티스트'입니다.
개별 이슈들을 파편적으로 보는 것이 아니라, **'구조적 연결고리(Structural Linkage)'**를 찾아내어 거대한 산업의 흐름을 예측하는 것이 당신의 핵심 임무입니다.

## Critical Process: Triple-Search Heuristics (Weekly Edition)
**작성 전, 반드시 아래 3가지 의도를 가지고 검색("googleSearch")을 수행하십시오.**
1. **[Synthesis Search]**: 이번 주 발생한 여러 클러스터링 이슈들 사이의 공동 분모나 상충하는 지점(Conflict)을 찾으십시오.
2. **[Paradigm Validation]**: 현재 관측되는 변화가 일시적인 노이즈인지, 아니면 산업 패러다임이 변하는 '구조적 전환점(Inflection Point)'인지 뒷받침할 데이터와 전문가 기고를 찾으십시오.
3. **[Forward-Looking Scenarios]**: '6-month Outlook', 'Industry Forecast 2026', 'Strategic Roadmap' 등의 쿼리를 사용하여 향후 시나리오를 구체화하십시오.

## Strategic Reasoning Chain
리포트를 작성하기 전, 반드시 다음의 논리 전개를 거치십시오.
${expert.reasoning}
- **Second-Order Consequences**: 이번 주의 트렌드가 6개월 뒤 유관 산업 생태계(Ecosystem)에 미칠 연쇄 반응은 무엇인가?
- **Decision Matrix**: 독자가 이 데이터를 기반으로 자원 배분(Resource Allocation)을 어떻게 변경해야 하는가?

## Core Rules
1) **No Mock Data**: 정량적 데이터(%, $, 수주액, CapEx)를 반드시 포함하십시오. 모호한 표현 절대 금지.
2) **Strategic Coherence**: 리포트 전체가 하나의 일관된 메시지를 향하게 하십시오. "최근 이런 일이 많았다"는 서술은 금지하며, "이러한 흐름이 단일 방향으로 수렴하고 있다"는 통찰을 제시하십시오.
3) **Source Extension**: 기존 브리프 소스 외에 최소 3~5개의 새로운 고품질 글로벌 소스를 추가하여 분석의 객관성을 확보하십시오.
4) **Label Precision**: 아래 Output Format의 대괄호 [] 안 레이블은 절대 변경·축약 금지. [Top Strategic Signal]을 [Signal]로 축약하는 것을 금지합니다. 정확히 그대로 출력하십시오.
5) **No Empty Sections**: 모든 ## ■ 섹션에 반드시 실질적 내용을 포함할 것. 빈 섹션은 절대 금지.
6) **Minimum Depth**: [Strategic Analysis] 태그 뒤에는 반드시 2~3개의 개조식 하위 블릿(-)을 사용하여 깊이 있게 분석하고, 마지막 부분에 (Basis: 근거)를 명시할 것.
7) **Professional Tone**: **모든 출력 텍스트는 명사형 종결어미(~함, ~임, ~전망 등)를 사용하는 짧은 '개조식 축약 문체'로 작성할 것. 긴 줄글(paragraph) 형태의 서술을 절대 금지하며, 하위 블릿(-)을 적극 활용하여 간결하게 작성할 것. 서술어(~습니다, ~한다) 절대 금지.**

## Output Format
반드시 아래 포맷을 엄격히 준수하십시오.
꺾쇠 < > 안의 지시문은 당신이 실제 내용으로 치환해야 할 부분입니다. < > 기호 자체는 최종 출력에 포함되지 않습니다.
대괄호 [ ] 안의 레이블은 절대 수정하지 말고 그대로 유지하십시오.

# [주간 전략 리포트] <클러스터를 관통하는 핵심 구조적 테마 1줄>

분석대상: ${domainLabel}
타겟: CTO/CSO, 전략기획 총괄, 투자 의사결정자
기간: ${periodLabel}
종합 분석: ${clusters.length}개 핵심 테마, ${allIssues.length}건 이슈 융합 분석

## ■ Executive Summary
- **[Top Strategic Signal]** <이번 주 관측된 가장 파괴적인 단 하나의 신호 — 구체적 수치 포함>
- **[Converged Mega Trend]** <클러스터들이 공통으로 가리키는 거대한 산업의 물줄기>
- **[Strategic Recommendation]** <의사결정자를 위한 즉각적 행동 제언>

## ■ Structural Cluster Analysis
<각 클러스터별로 아래 형식을 반복하십시오>

### 🔹 <클러스터명>
**핵심 전략 가치**: <이 클러스터가 미래 경쟁력에 주는 의미 1줄>

    #### Key Developments & Context
    - **[Fact]** <검색된 팩트 — 수치, 날짜, 기업명 필수>
    - **[Strategic Analysis]** <이 진전이 산업 구조에 미치는 영향을 2~3개의 하위 블릿으로 개조식 분석> (Basis: <분석 근거 프레임워크 또는 유사 사례>)
    - **[Structural Linkage]** <타 클러스터 이슈와의 유기적 관계 및 시너지/충돌 분석>

## ■ Second-Order Economic Insights
### <가시화되는 산업적 변화 제목>
- **[Primary Driver]** <변화를 유도하는 핵심 동인 — 구체적 데이터 포함>
- **[Ripple Effects]** <전/후방 산업에 미칠 연쇄 파급 효과 상세 기술>

## ■ Professional Implications
- **[Market & CapEx]** <시장 규모 및 기업들의 자본 투자 방향 변화 — 수치 포함>
- **[Technology Frontier]** <기술적 병목 구간과 이를 돌파하려는 혁신 주체들의 동향>
- **[Competitive Edge]** <이 흐름에서 승자와 패자를 가를 핵심 경쟁 요소>
- **[Policy & Regulation]** <주요국 정책 및 규제 환경 변화가 산업에 미치는 실질적 영향>

## ■ Risks & Uncertainties
- **[TECH]** <기술적 리스크>
  - Impact: <예상 부정적 영향>
- **[MARKET]** <시장/거시경제 리스크>
  - Impact: <예상 부정적 영향>
- **[REGULATION]** <규제/정책 리스크>
  - Impact: <예상 부정적 영향>

## ■ Strategic Watchlist: Indicators to Monitor
- **<핵심 선행 지표 1>**
  (Why) <이것이 왜 Inflection Point 트리거인지>
  (Threshold) <어떤 수치/변화 국면에서 전략적 피보팅이 필요한지>
- **<핵심 선행 지표 2>**
  (Why) <설명>
  (Threshold) <피보팅 기준>

## ■ Sources
(시스템이 자동 주입합니다)

## START
지금 즉시 초격차 주간 전략 분석을 시작하십시오. 검색과 연결이 핵심입니다.`;

    const model = genAI.getGenerativeModel({
        model: 'gemini-3.1-pro-preview',
        systemInstruction: systemPrompt,
        tools: [{ googleSearch: {} } as any],
    });

    const userPrompt = `
# 주간 리포트 생성 요청

## 분석 기간: ${periodLabel}
## 총 이슈 수: ${allIssues.length} 건
## 클러스터 수: ${clusters.length} 개

---
## 클러스터별 이슈 데이터

${clusterContext}

---
## TODAY_KST: ${kstDateStr}

위 클러스터 데이터를 기반으로 주간 종합 심층 리포트를 작성하십시오.
반드시 검색(googleSearch)을 먼저 수행한 후 작성하십시오.`;

    try {
        console.log(`[Weekly Report] 주간 리포트 생성 시작(${clusters.length} clusters, ${allIssues.length} issues)...`);

        let result;
        let isFallback = false;

        try {
            // 1. Primary Attempt: Pro Model with Retry
            result = await generateWithRetry(model, userPrompt, 2, 3000);
        } catch (primaryError: any) {
            console.warn('[Weekly Report] Primary Pro Model failed, trying Fallback Flash Model...', primaryError.message);
            // 2. Fallback Attempt: Flash Model (Faster, more available)
            const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
            result = await generateWithRetry(fallbackModel, userPrompt, 2, 2000);
            isFallback = true;
        }

        const response = result.response;
        let text = response.text();

        if (isFallback) {
            text = `> [!NOTE]\n> 현재 서비스 부하로 인해 AI 모델이 일시적으로 변경되었습니다. 분석의 깊이가 다소 차이날 수 있습니다.\n\n${text}`;
        }

        // Extract new sources from grounding metadata
        const briefingSources = allIssues.flatMap(i => i.sources || []);
        const additionalSources: string[] = [];

        const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
        if (groundingMetadata?.groundingChunks) {
            groundingMetadata.groundingChunks.forEach((chunk: any) => {
                if (chunk.web?.url) {
                    const url = chunk.web.url;
                    if (!briefingSources.includes(url)) {
                        additionalSources.push(url);
                    }
                }
            });
        }

        // Build final sources section
        const combinedSourcesSet = new Set([...briefingSources, ...additionalSources]);
        const finalUniqueSources = Array.from(combinedSourcesSet);

        let newSourcesSection = '\n## ■ Sources\n';
        finalUniqueSources.forEach((url, idx) => {
            try {
                const urlObj = new URL(url);
                const hostname = urlObj.hostname.replace('www.', '');
                const label = briefingSources.includes(url) ? 'Brief Origin' : 'Deep Research';
                newSourcesSection += `- [${idx + 1}] ${hostname} | [${label}] ${url}\n`;
            } catch (e) {
                newSourcesSection += `- [${idx + 1}] Source | ${url}\n`;
            }
        });

        const expansionCount = finalUniqueSources.length - new Set(briefingSources).size;
        newSourcesSection += expansionCount > 0
            ? `\n(브리프 원본 소스 ${new Set(briefingSources).size}개를 기반으로, 추가 리서치를 통해 ${expansionCount}개의 신규 출처를 확보했습니다.)\n`
            : `\n(브리프 원본 소스를 기반으로 작성되었습니다.)\n`;

        const sourcesPattern = /## ■ Sources[\s\S]*$/i;
        const bodyContent = text.replace(sourcesPattern, '').trim();
        const finalReport = `${bodyContent}\n\n${newSourcesSection}`;

        console.log(`[Weekly Report] 생성 완료. Sources: brief(${new Set(briefingSources).size}) + new (${expansionCount})`);
        return finalReport;

    } catch (error) {
        console.error('[Weekly Report] Generation failed after all attempts:', error);
        return null;
    }
}

// ─── Helper: Retry logic ───────────────────────────────────────────────────
async function generateWithRetry(model: GenerativeModel, prompt: string | any, retries = 3, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await model.generateContent(prompt);
        } catch (error: any) {
            const isOverloaded = error.status === 503 || error.message?.includes('overloaded') || error.message?.includes('high demand');
            const isRateLimit = error.status === 429 || error.message?.includes('RESOURCE_EXHAUSTED');

            if ((isOverloaded || isRateLimit) && i < retries - 1) {
                console.warn(`[Gemini Retry] Attempt ${i + 1} failed. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
                continue;
            }
            throw error;
        }
    }
    throw new Error('Retry attempts exhausted');
}
