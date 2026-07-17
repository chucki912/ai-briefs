/**
 * Deep Dive 구조화 파이프라인 v3 (도메인 공통).
 *
 * AI/배터리가 이 파이프라인을 공유하고 도메인 차이는 DeepDiveDomainConfig로 주입한다(복제 금지).
 * 게이트(삼각검증·내용·티어링·zero-grounding)·예산·복구 경로·스키마·렌더러는 도메인 무관 공유 —
 * 도메인 전용 예외를 만들지 말 것.
 *
 * 흐름: pass 1(PRO+googleSearch 초안, 삼각검증 게이트+재생성 루프)
 *      → pass 2(FLASH+responseSchema 구조화, 내용 게이트+2단 복구)
 *      → renderDeepDiveB(파생 마크다운). structured(JSON)가 원본(source of truth).
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { IssueItem, SourceRef, ReportType, DeepDiveStructured } from '@/types';
import { FLASH_MODEL, PRO_MODEL } from './gemini-models';
import { TRIANGULATION_CONFIG, CONTENT_GATE_CONFIG, GLOBAL_BUDGET, SOURCE_TIERING, GROUNDING_POLICY } from './validation-config';
import { validateTriangulation, toRegistrableDomain, urlToRegistrableDomain, isDenylistedDomain, type TriangulationResult } from './validate-triangulation';
import { validateDeepDiveContent, type ContentGateResult } from './validate-deep-dive';
import { DEEP_DIVE_RESPONSE_SCHEMA, DEEP_DIVE_STRUCTURING_SYSTEM_PROMPT, buildStructuringInput, buildPass1ContentFeedback } from './deep-dive-schema';
import { renderDeepDiveB } from './render-deep-dive-b';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// 트렌드 센싱 리포트 (Deep Dive) 생성 결과.
// structured(JSON)가 원본(source of truth)이고 markdown은 renderDeepDiveB(B유형)가 만든 파생물임.
export interface TrendReportResult {
    markdown: string;
    structured: DeepDiveStructured;
    triangulation: TriangulationResult;
    contentGate: ContentGateResult;
    reportType: ReportType;
}

// pass 2(구조화) 모델 — 추출 작업이므로 FLASH로 충분. 품질 문제 발견 시 이 상수만 교체.
const DEEP_DIVE_STRUCTURING_MODEL = FLASH_MODEL;

// ── 도메인 주입 지점 ─────────────────────────────────────────────────────────
export interface DeepDiveDomainConfig {
    reportType: Extract<ReportType, 'deep_dive' | 'battery_deep_dive'>;
    jobKeyPrefix: string;    // KV job 키 체계 (라우트에서 사용)
    logLabel: string;        // 로그 접두 (예: 'Trend API', 'Battery Trend')
    rolePreamble: string;    // 도메인 역할 문단 (시스템 프롬프트 최상단)
    tripleSearch: string;    // Triple-Search Heuristics 3항목 (도메인판)
    searchSteering: string;  // 검색 출처 조향 문구 (빈 문자열이면 블록 생략)
    reasoningChain: string;  // Strategic Reasoning Chain 항목들 (도메인판)
}

export const AI_DEEP_DIVE_DOMAIN: DeepDiveDomainConfig = {
    reportType: 'deep_dive',
    jobKeyPrefix: 'trend_job',
    logLabel: 'Trend API',
    rolePreamble: `당신은 경력 20년의 산업 인텔리전스 애널리스트임.
입력된 단일 브리프(단신)를 기점으로, 그 이면의 **구조적 변화와 파급 효과**를 끝까지 파고드는 Deep Dive 리포트를 작성하는 것이 임무임.
브리프의 맥락을 100% 상속하되, 검색으로 정보의 깊이와 외연을 확장하여 의사결정자에게 판단 프레임을 제시할 것.`,
    tripleSearch: `1. **[Primary Evidence]** 입력 이슈의 1차 사실(수치·날짜·주체)을 원출처 수준에서 정밀 확인.
2. **[Structural Context]** 이 사건이 속한 더 큰 구조(가치사슬·원가추이·정책)의 배경과 궤적을 탐색.
3. **[Independent Triangulation]** 입력 소스와 *독립적인* 신규 고품질 출처(IR 자료·전문 리포트·글로벌 테크 미디어)로 교차검증.`,
    searchSteering: '', // AI판은 기존 프롬프트 유지(별도 조향 블록 없음 — 동작 변경 0)
    reasoningChain: `- **Mechanism Limit**: 해당 기술/모델이 물리·화학·경제적 한계에 얼마나 도달했는가?
- **Structural Efficiency**: 수직 계열화·규모·전환비용이 경제적 해자를 얼마나 강화/약화하는가?
- **Second-Order Effects**: 이 변화가 1차 당사자가 아닌, 전방·후방·인접 시장에 미칠 2·3차 파급은 무엇인가?`,
};

// 배터리판: 구 K-Battery 프롬프트의 분석 관점·용어를 v3 구조로 이식 (Basis 부착 체계는 소멸 —
// v3 Core Rule 3 'Mechanism Over Labels'가 라벨 부착을 금지하므로 이식하지 않음)
export const BATTERY_DEEP_DIVE_DOMAIN: DeepDiveDomainConfig = {
    reportType: 'battery_deep_dive',
    jobKeyPrefix: 'battery_trend_job',
    logLabel: 'Battery Trend',
    rolePreamble: `당신은 경력 20년의 글로벌 배터리 산업 전략 컨설턴트임.
입력된 단일 배터리 브리프(단신)를 기점으로, 그 이면의 **가치사슬 구조 변화와 파급 효과**를 끝까지 파고드는 Deep Dive 리포트를 작성하는 것이 임무임. 글로벌 에너지 전환의 핵심인 배터리 산업에서 'K-Battery의 생존과 도약'을 위한 판단 프레임을 도출할 것.
브리프의 맥락을 100% 상속하되, 검색으로 정보의 깊이와 외연을 확장하여 의사결정자에게 판단 프레임을 제시할 것.`,
    tripleSearch: `1. **[Supply Chain Analysis]** 핵심 광물(리튬·니켈·흑연 등)의 가격 추이, 공급선 변화, 자원 민족주의 리스크를 원출처 수준에서 정밀 확인.
2. **[Cost Curve & CapEx]** 선도 기업(CATL·BYD vs K-Battery)의 공정 혁신, 투입 비용(CapEx), 제조 원가 곡선의 배경과 궤적을 탐색.
3. **[Policy Moat]** IRA·CRMA·관세 등 각국 보호무역 정책이 실제 시장 점유율에 미치는 영향을 입력 소스와 *독립적인* 신규 고품질 출처로 교차검증.`,
    searchSteering: `검색 결과 선별 시 기업 IR·실적발표·규제 공시, 산업 전문 조사기관(SNE Research, BloombergNEF, Benchmark Mineral Intelligence 등), 1차 보도(통신사·주요 경제지)를 우선 채택할 것. 집계·리라이팅 사이트의 수치 금지.`,
    reasoningChain: `- **Physics & Chemistry Limit**: 해당 기술(전고체, 실리콘 음극재, LFP 에너지 밀도 등)이 물리·화학적 한계에 얼마나 도달했는가?
- **Vertical Integration Efficiency**: 소재-셀-리사이클링 수직 계열화가 경제적 해자를 얼마나 강화/약화하는가?
- **Second-Order Effects**: 중국의 저가 공세가 완제품 단계가 아닌, 전방 '전기차 시장'과 후방 'ESS' 시장에 미칠 2·3차 파급은 무엇인가?`,
};

// v3 시스템 프롬프트 골격 — 도메인 무관 본문은 여기 단일 위치에만 존재.
// AI config로 조립 시 리팩토링 이전 프롬프트와 바이트 동일해야 함 (동작 변경 0 보증).
export function buildDeepDiveSystemPrompt(config: DeepDiveDomainConfig): string {
    return `# SYSTEM INSTRUCTION — 브리프 심층 리포트(Deep Dive) 통합 프롬프트 v2

${config.rolePreamble}

---

## ★ PRIME DIRECTIVE — 브리프와의 '깊이 차이' (이 리포트의 존재 이유)

본 리포트는 입력 브리프보다 **양(量)이 아니라 종(종)이 다른** 산출물이어야 함.
브리프가 구조적으로 수행할 수 없는 아래 3가지 도약을 반드시 완수할 것.

1. **[단위 도약] 사건 → 구조**
   - 입력 이슈를 '증상'으로 취급할 것.
   - 그 밑에서 움직이는 시스템(가치사슬·원가곡선·경쟁 해자)의 변화를 규명할 것.
   - 리포트 말미에 여전히 *같은 그 사건*만 반복하고 있으면 실패임.

2. **[증거 도약] 자기 출처 → 교차검증된 외부 증거**
   - ISSUE_URLS 외에 독립적 신규 출처 **최소 3개**를 검색으로 확보·인용할 것.
   - 브리프 원본 소스만 재인용하면 '깊이'가 아님 — 같은 증거를 다르게 쓴 것에 불과함.
   - 출처 확장은 장식이 아니라 **깊이의 정의 그 자체**임.

3. **[시간 도약] 스냅샷 → 궤적·분기점**
   - 이 사건이 더 긴 흐름의 어디쯤에 있는지(과거 궤적) 명시할 것.
   - 향후 6~12개월의 분기 시나리오와, 그 갈림길을 선별해주는 선행지표를 제시할 것.

### Anti-Redundancy Litmus (자가 검증 — 위배 시 재작성)
- 브리프와 본 리포트의 Executive Summary를 나란히 놓았을 때 **같은 말을 하고 있으면 실패**임.
- 브리프의 결론(soWhat)은 '가설'임. 본 리포트의 결론은 '외부 증거로 조사한 뒤의 **판정**'이어야 함.
- "이렇게 보임"이 아니라 → "조사 결과 이러하며, 여기까지는 검증됐고 여기부터는 여전히 불확실함" 형태로 진술할 것.

### Anti-Overclaim Litmus (자가 검증 — 위배 시 재작성)
- 결론의 강도는 팩트의 스케일을 초과할 수 없음. 파일럿·초기 단계 팩트로 '완료·장악·확정·입증' 등 종결형 단정 금지 — '개시·전환 중·시사' 수준으로 기술하고, 종결형 단정은 그 규모를 증명하는 정량 근거가 결합된 경우에만 허용.
- 각 핵심 주장에 대해 자문할 것: 이 주장을 뒷받침하는 팩트가 이 주장의 크기만큼 큰가? 아니라면 주장을 팩트 크기로 줄일 것.

---

## ★ 독자에게 반드시 제공할 3가지 (Reader Value)

1. **정량 앵커(Quantitative Anchor)**
   - 베팅의 *크기·시점*을 바꾸는 검증 가능한 핵심 수치 1개를 도출할 것.
   - 그 수치의 출처·기준시점, 그리고 *어느 수준을 넘으면 판단이 뒤집히는지(임계치)*를 함께 명시할 것.
2. **인과 지도(Causal Map)**
   - 헤드라인에 아직 없는 2차·3차 파급을 그릴 것.
   - 누구의 마진이 눌리고, 어느 전방·후방·인접시장이 충격을 흡수하는지 연결선을 제시할 것.
3. **판단 프레임 + 폐기 조건(Decision Frame + Kill Trigger)**
   - 결론을 떠먹이지 말 것. 독자가 스스로 판단하고 *자신이 틀린 순간을 미리 알 수 있도록* 무장시킬 것.

---

## Critical Process: Triple-Search Heuristics (작성 전 필수)
작성 전, 반드시 아래 3가지 의도로 검색("googleSearch")을 수행할 것.
${config.tripleSearch}${config.searchSteering ? `\n\n${config.searchSteering}` : ''}

## Strategic Reasoning Chain (사고 구속 조건)
리포트 작성 전, 반드시 다음 사고 도구로 논리를 전개할 것.
${config.reasoningChain}

---

## Core Rules

1. **Cold, Hard Facts**: 장밋빛 전망 지양. 경쟁사의 강점과 우리의 약점을 냉철하게 직시하는 분석을 우선할 것.
2. **No Mock Data (검증 강제)**: 모든 정량 주장(%, $, GWh, Ton, 점유율 등)에는 **인라인 출처와 기준시점을 괄호로 즉시 결합**할 것. 예: \`셀 원가 $89/kWh (BloombergNEF, 2025-09 기준)\`. 출처를 결합할 수 없는 수치는 작성 금지.
3. **Mechanism Over Labels**: \`(Basis: 네트워크 효과)\` 같은 프레임워크 라벨의 기계적 부착을 **절대 금지**함. 대신 해당 효과가 *왜·어떻게* 작동하는지 인과관계 문장으로 본문에서 증명할 것. (※ 모든 모듈 공통 — 라벨 부착/금지 정책을 본 규칙으로 일원화함)
4. **Source Expansion = Depth**: 입력 외 독립 신규 출처 최소 3개 확보. 미달 시 깊이 미달로 간주.
5. **Contract Completeness**: 아래 Output Format의 '계약 항목'을 하나도 빠짐없이 다룰 것. 누락된 항목은 최종 리포트에서 영구 공란이 됨.
6. **No Empty Items**: 모든 계약 항목에 실질적 내용을 포함할 것. 항목만 언급하고 내용을 비우는 것 금지.
7. **Professional Tone**: 모든 문장을 명사형 종결어미(~함, ~임, ~전망 등)의 짧은 '개조식 축약 문체'로 작성할 것. 긴 줄글(paragraph) 금지, 서술어(~습니다, ~한다) 금지, 하위 블릿(-) 적극 활용.
8. **No Hype**: "세계 최고", "초격차", "게임체인저", "거대한 물줄기" 등 과장 수사 배제. 중립적·검증 가능한 서술로 채울 것.
9. **당사자 프레임 검증**: 이해당사자의 자기 서사(벤더의 영업 화법·경쟁사 비교, 소송 당사자의 주장, 기업의 자체 성과 발표)를 인용할 때는 반드시 (a) 반대 당사자의 반박 또는 (b) 독립 제3자의 유보·검증 중 최소 1개를 같은 섹션에 결합할 것. 결합할 수 없으면 해당 주장을 '~라고 주장함' 수준의 귀속 표현으로 한정하고 리포트의 논지로 승격하지 말 것.

---

## Output Format — 분석 초안 (자유 서술)
마크다운 템플릿이 아니라, 아래 '계약 항목'을 전부 다루는 **분석 초안**을 작성할 것.
이 초안은 이후 구조화 단계(JSON 추출)의 유일한 원천임 — 초안에서 다루지 않은 항목은 최종 리포트에서 영구 공란이 됨.
각 항목이 어디 있는지 식별 가능하도록 항목명을 소제목이나 라벨로 명시하며 서술할 것.

### 계약 항목 (전부 필수)
1. **제목 + 메타**: 이슈를 관통하는 제목 / 분석대상(기업·기술·소재명) / 타겟 독자(CEO/CTO·전략기획·투자심사역 등) / 전망 기간(분석 기준일 기준 향후 6~12개월) / 관점(Technology·Market·Geopolitics·Supply Chain 중 택 1)
2. **센싱 배경**: 왜 지금 이 이슈인가(Why Now) + 이 사건이 놓인 과거 궤적(Trajectory — 시간 도약)
3. **Signal**: 이 이슈가 보내는 핵심 신호 — 정량 앵커 수치와 출처 포함
4. **Anchor**: 베팅의 크기·시점을 바꾸는 검증 가능한 핵심 수치 1개 — 지표명/수치/출처/기준시점/판단이 뒤집히는 임계치(flipThreshold)를 전부 명시
5. **Key Developments 2건 이상**: 각각 Fact(검색된 구체적 사실 — 수치·날짜·주체, 인라인 출처 결합) + Analysis(작동 메커니즘을 인과 문장으로 증명하는 개조식 블릿 2~3개, Basis 꼬리표 금지)
6. **Second-Order Map**: Primary Shift(핵심 구조 변화 1줄) / Upstream(후방 파급 — 누구의 마진·물량이 변하는가) / Downstream(전방 파급) / Adjacent(인접 시장의 충격·반사이익) — 헤드라인에 아직 없는 2·3차 파급을 신규 발굴할 것
7. **So What 4요소**: 추론이 유지될 때 바뀌는 것 / 아직 확인되지 않은 핵심 변수 / 행동 판단(지금 실행할 것이 있으면 그 행동과 양쪽 비용, 관측만 필요하면 셀 수 있는 지표와 주기, 없으면 '행동 없음'을 명시) / 폐기 트리거(killTrigger — 날짜·수치 포함)
8. **Risks**: 기술(tech)·시장(market)·규제(reg) 각각에 대해 리스크 + 하방 비용 + Mitigation
9. **Watchlist 2개 이상**: 선행 지표 / 왜 중요한 트리거인지(Why) / 피보팅 기준(Threshold) / 논지가 무너지는 조건(폐기 트리거) / 그 지표를 공개적으로 관측할 수 있는 곳(dataSource)

## START
지금 즉시 검색을 시작하고, 팩트를 기반으로 작성할 것. 상상하지 말고 검색할 것.
브리프보다 '종(종)이 다른' 깊이를 만들지 못하면 작성 실패임.`;
}

// 게이트 정책에 의한 의도적 폐기 — 호출부(라우트)가 사유를 job 레코드에 실어 UI까지 전파.
// API 오류 등 원인 미상 실패는 기존대로 null 반환(호출부의 generic 처리 유지).
export class DeepDiveDiscardError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DeepDiveDiscardError';
    }
}

// ── 파이프라인 본체 (도메인 공통) ────────────────────────────────────────────
export async function generateStructuredDeepDive(
    issue: IssueItem,
    context: string, // Kept for compatibility
    config: DeepDiveDomainConfig,
): Promise<TrendReportResult | null> {
    const model = genAI.getGenerativeModel({
        model: PRO_MODEL,
        systemInstruction: buildDeepDiveSystemPrompt(config),
        tools: [{ googleSearch: {} } as any],
    });

    const nowDate = new Date();
    const kstDateStr = nowDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

    const userPrompt = `
# INPUTS
- ISSUE_TITLE: ${issue.headline}
- ISSUE_BULLETS: ${issue.keyFacts.join(', ')}
- ISSUE_URLS:
${issue.sources ? issue.sources.join('\\n') : 'URL 없음'}
- TODAY_KST: ${kstDateStr}`;

    try {
        console.log(`[${config.logLabel}] 상세 리포트 생성 시작 (2-pass: Pro 검색 초안 → Flash 구조화 → 내용 게이트)...`);

        const briefingSources = issue.sources || [];
        // 전역 예산: triangulation 재생성 + content gate 재실행을 합산한 pass 1 총 실행 상한
        const budget = { pass1Runs: 0 };
        let pass1ContentFeedback = '';
        // zero-grounding 이월용: 다음 cycle의 pass 1 첫 시도에 실어 보낼 삼각검증 슬롯(RETRY FEEDBACK) 피드백
        let pass1RegenCarry = '';
        // tag 모드 폴백용: 마지막으로 조립 가능했던 (draft, structured, gate) 묶음 — 항상 같은 draft 기준
        let last: { draft: DeepDivePass1Draft; structured: DeepDiveStructured; gate: ContentGateResult } | null = null;

        const maxCycles = 1 + CONTENT_GATE_CONFIG.MAX_PASS1_RERUNS;
        for (let cycle = 1; cycle <= maxCycles; cycle++) {
            // ── pass 1: 검색+분석 초안 (triangulation 게이트·재생성 루프 부착, 예산 차감) ──
            const draft = await runDeepDivePass1(model, userPrompt, briefingSources, pass1ContentFeedback, budget, cycle, pass1RegenCarry);
            pass1RegenCarry = '';
            if (!draft) break; // 예산 소진으로 이번 cycle의 pass 1을 시작조차 못 함 → 지금까지의 결과로 FAIL_MODE 처리

            // 무검색 방어: 재시도 소진 후에도 grounding 0이면 FAIL_MODE와 무관하게 출고 금지 (tag 모드 포함).
            // 단, 무검색은 서버 측 간헐 현상(재시도로 회복되는 패턴 관측)이라 예산·cycle이 남았으면 즉시 폐기하지 않고 이월.
            if (GROUNDING_POLICY.REQUIRE_ANY_GROUNDING && draft.triangulation.totalChunks === 0) {
                if (cycle < maxCycles && budget.pass1Runs < GLOBAL_BUDGET.MAX_TOTAL_PASS1_RUNS) {
                    console.warn(`[Triangulation] zero-grounding — 예산 잔여(${budget.pass1Runs}/${GLOBAL_BUDGET.MAX_TOTAL_PASS1_RUNS}) → cycle ${cycle + 1}로 pass 1 재실행 이월: "${issue.headline}"`);
                    pass1RegenCarry = `직전 시도에서 검색이 전혀 수행되지 않았음. 작성 전 Triple-Search(1차 사실 확인·구조적 맥락·독립 교차검증)를 반드시 수행할 것. 검색 없는 작성은 실패로 처리됨.`;
                    continue;
                }
                // 출고 금지 대상은 '무검색 산출물'이지 리포트 전체가 아님 — 앞 cycle의 grounded 산출물이
                // 있으면 이 draft만 버리고 FAIL_MODE 처리로 폴백 (tag 모드면 미달 태그 부착 출고)
                if (last) {
                    console.warn(`[Triangulation] zero-grounding — 무검색 draft만 폐기, 직전 grounded 산출물로 폴백: "${issue.headline}"`);
                    break;
                }
                console.warn(`[Triangulation] zero-grounding reject → 리포트 폐기: "${issue.headline}" (검색 미수행 산출물은 tag 모드에서도 출고 금지)`);
                throw new DeepDiveDiscardError('검색 그라운딩 미확보(무검색 산출물)로 리포트 폐기 — Gemini 검색 도구 간헐 미작동 가능성, 잠시 후 재시도 요망');
            }

            // triangulation 최종 미달 → FAIL_MODE (기존 패턴 유지)
            if (!draft.triangulation.pass) {
                if (TRIANGULATION_CONFIG.FAIL_MODE === 'reject') {
                    console.warn(`[Triangulation] 최종 미달(FAIL_MODE=reject) → 리포트 폐기: "${issue.headline}"`);
                    throw new DeepDiveDiscardError(`독립 신규 출처 ${draft.triangulation.independentDomainCount}개로 삼각검증 기준(${TRIANGULATION_CONFIG.MIN_INDEPENDENT_DOMAINS}개) 미달 — 리포트 폐기`);
                }
                console.warn(`[Triangulation] 최종 미달(FAIL_MODE=tag) → depthWarning 부착하고 구조화 진행: "${issue.headline}"`);
            }

            // 소스 참조는 코드가 결정적으로 구성 — LLM의 URL 날조 여지 차단(JSON 원본의 무결성)
            const sourceRefs = buildDeepDiveSourceRefs(briefingSources, draft.groundingMetadata);

            // ── pass 2 + 내용 게이트: 1차 복구 = 구조화만 재시도 (추출 누락은 싸게 복구) ──
            let gateFeedback = '';
            const maxPass2 = 1 + CONTENT_GATE_CONFIG.MAX_PASS2_RETRIES;
            for (let attempt = 1; attempt <= maxPass2; attempt++) {
                const structured = await structureDeepDiveDraft(draft.text, sourceRefs, config.reportType, gateFeedback);
                if (!structured) continue; // 파싱 실패(내부 재시도 포함) — 남은 attempt로 이월

                const gate = validateDeepDiveContent(structured, CONTENT_GATE_CONFIG, SOURCE_TIERING);
                console.log(
                    `[ContentGate] attempt=${attempt} stage=pass2 cycle=${cycle} pass=${gate.pass} ` +
                    `failures=${gate.failures.length} paths=[${gate.failures.map(f => f.path).join(', ')}]`
                );
                last = { draft, structured, gate };
                if (gate.pass) return assembleTrendReport(last, briefingSources.length, config);

                gateFeedback =
                    `직전 추출에서 다음 필드가 계약 미달임: ${gate.failures.map(f => `${f.path}: ${f.detail}`).join('; ')}. ` +
                    `초안에서 해당 내용을 다시 찾아 채울 것. 초안에 정말 없으면 빈 값으로 둘 것.`;
            }

            // ── 2차 복구: pass 2 소진 → 초안 자체에 판단 내용이 없는 경우, pass 1부터 재실행 ──
            if (cycle < maxCycles) {
                pass1ContentFeedback = last
                    ? buildPass1ContentFeedback(last.gate.failures)
                    : '직전 시도는 구조화(JSON 추출) 자체가 실패했음. 계약 항목을 명시적 소제목으로 구분해 서술할 것.';
                console.log(`[ContentGate] stage=pass1 cycle=${cycle + 1} 재실행 예약 (직전 미달 ${last?.gate.failures.length ?? '파싱실패'}건)`);
            }
        }

        // ── 전 단계 소진 → FAIL_MODE 처리 (triangulation과 동일 패턴) ──
        if (!last) {
            console.error(`[DeepDive] 구조화 산출물 없음(파싱 실패/예산 소진) → 리포트 폐기: "${issue.headline}"`);
            throw new DeepDiveDiscardError('구조화(JSON 추출) 실패 또는 생성 예산 소진으로 리포트 폐기 — 잠시 후 재시도 요망');
        }
        if (CONTENT_GATE_CONFIG.FAIL_MODE === 'reject') {
            console.warn(`[ContentGate] 최종 미달(FAIL_MODE=reject) → 리포트 폐기: "${issue.headline}"`);
            throw new DeepDiveDiscardError(`판단 필드 ${last.gate.failures.length}건이 내용 게이트 기준 미달(FAIL_MODE=reject) — 리포트 폐기`);
        }
        console.warn(`[ContentGate] 최종 미달(FAIL_MODE=tag) → contentGate 결과 부착 반환: "${issue.headline}" (${last.gate.failures.length}건 미달)`);
        return assembleTrendReport(last, briefingSources.length, config);
    } catch (error) {
        if (error instanceof DeepDiveDiscardError) throw error; // 게이트 폐기 사유는 호출부로 전파(UI 표시용)
        console.error('[Trend Report Error]', error);
        return null;
    }
}

interface DeepDivePass1Draft {
    text: string;
    groundingMetadata: unknown;
    triangulation: TriangulationResult;
}

// pass 1 실행기: triangulation 게이트+재생성 루프를 포함하며, 전역 예산(GLOBAL_BUDGET)을 차감.
// 예산이 소진되어 이번 cycle에서 한 번도 실행하지 못하면 null.
async function runDeepDivePass1(
    model: ReturnType<typeof genAI.getGenerativeModel>,
    userPrompt: string,
    briefingSources: string[],
    contentFeedback: string,
    budget: { pass1Runs: number },
    cycle: number,
    initialRegenFeedback = '', // zero-grounding 이월 시 새 cycle 첫 시도부터 RETRY FEEDBACK 슬롯에 주입
): Promise<DeepDivePass1Draft | null> {
    const maxAttempts = 1 + TRIANGULATION_CONFIG.MAX_REGEN_ATTEMPTS;
    let regenFeedback = initialRegenFeedback;
    let draft: DeepDivePass1Draft | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (budget.pass1Runs >= GLOBAL_BUDGET.MAX_TOTAL_PASS1_RUNS) {
            console.warn(`[Budget] pass1 총 실행 ${budget.pass1Runs}회 = 상한(${GLOBAL_BUDGET.MAX_TOTAL_PASS1_RUNS}) → 추가 실행 중단`);
            break;
        }
        budget.pass1Runs++;

        let attemptPrompt = userPrompt;
        if (contentFeedback) attemptPrompt += `\n\n# CONTENT FEEDBACK (직전 리포트 판단 필드 미달 — 아래 항목 필수 서술)\n${contentFeedback}`;
        if (regenFeedback) attemptPrompt += `\n\n# RETRY FEEDBACK (직전 시도 삼각검증 미달)\n${regenFeedback}`;

        const result = await generateWithRetry(model, attemptPrompt);
        const response = await result.response;
        const text = response.text();
        const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

        // 삼각검증 게이트: 검색이 일어난 pass 1의 groundingMetadata가 게이트 입력 (+티어 제외)
        const triangulation = validateTriangulation(groundingMetadata, briefingSources, TRIANGULATION_CONFIG, SOURCE_TIERING);
        // 무검색 진단: 필드 자체 부재(요청 구성 문제 의심) vs 존재하되 청크 0/무필드(모델이 검색 스킵)
        const gmState = groundingMetadata == null
            ? 'metadata-absent'
            : `metadata-present chunks=${triangulation.totalChunks}`;
        console.log(
            `[Triangulation] attempt=${attempt} cycle=${cycle} pass1Runs=${budget.pass1Runs}/${GLOBAL_BUDGET.MAX_TOTAL_PASS1_RUNS} ` +
            `pass=${triangulation.pass} domains=${triangulation.independentDomainCount}/${TRIANGULATION_CONFIG.MIN_INDEPENDENT_DOMAINS} ` +
            `independent=[${triangulation.independentDomains.join(', ')}] ` +
            `excludedDenylisted=[${triangulation.excludedDenylisted.join(', ')}] ` +
            `input=[${triangulation.inputDomains.join(', ')}] unresolved=${triangulation.unresolvedChunks} grounding=${gmState}`
        );

        draft = { text, groundingMetadata, triangulation };
        if (triangulation.pass) break;

        // 무검색(청크 0)이면 '독립 출처 미달'이 아니라 '검색 미수행'이 원인 — 전용 피드백
        regenFeedback = triangulation.totalChunks === 0
            ? `직전 시도에서 검색이 전혀 수행되지 않았음. 작성 전 Triple-Search(1차 사실 확인·구조적 맥락·독립 교차검증)를 반드시 수행할 것. 검색 없는 작성은 실패로 처리됨.`
            : `직전 시도는 독립 신규 출처가 ${triangulation.independentDomainCount}개로 기준(${TRIANGULATION_CONFIG.MIN_INDEPENDENT_DOMAINS}개) 미달이었음. ` +
            `입력 소스(${triangulation.inputDomains.join(', ')})와 다른 도메인의 독립 출처를 추가 검색으로 확보할 것. ` +
            `동일 사건의 재보도가 아닌, 배경·구조·경쟁 동향을 다루는 별도 스토리를 우선할 것.`;
    }
    return draft;
}

// 최종 결과 조립: 마크다운은 파생물 — 항상 B유형 렌더러가 JSON에서 생성(설계 원칙 1)
function assembleTrendReport(
    last: { draft: DeepDivePass1Draft; structured: DeepDiveStructured; gate: ContentGateResult },
    briefSourceCount: number,
    config: DeepDiveDomainConfig,
): TrendReportResult {
    const markdown = renderDeepDiveB(last.structured);
    const refCount = last.structured.sourceRefs.length;
    console.log(`[${config.logLabel}] 완료: sources=${refCount} (brief ${briefSourceCount} + research ${refCount - briefSourceCount}), developments=${last.structured.keyDevelopments.length}, contentGate=${last.gate.pass}`);
    return {
        markdown,
        structured: last.structured,
        triangulation: last.draft.triangulation,
        contentGate: last.gate,
        reportType: config.reportType,
    };
}

// Deep Dive 소스 참조 구성: 입력 브리프 소스(s1…) + pass 1 grounding 신규 소스(g1…).
// grounding URL은 Google 리다이렉트라 canonical 미해석(resolved:false), 도메인 힌트는 web.title.
function buildDeepDiveSourceRefs(briefingSources: string[], groundingMetadata: unknown): SourceRef[] {
    // 출처 티어 태깅: denylist 매칭='aggregator', 그 외='unknown' (positive 판정 안 함 — allowlist 승급 전)
    const tierOf = (domain: string | null): SourceRef['tier'] =>
        isDenylistedDomain(domain, SOURCE_TIERING.AGGREGATOR_DENYLIST) ? 'aggregator' : 'unknown';

    const refs: SourceRef[] = briefingSources.map((url, i) => ({
        id: `s${i + 1}`,
        url,
        resolved: !/news\.google\.com/.test(url),
        tier: tierOf(urlToRegistrableDomain(url)),
    }));
    const chunks = (groundingMetadata as { groundingChunks?: Array<{ web?: { uri?: string; url?: string; title?: string } }> } | null | undefined)?.groundingChunks;
    if (Array.isArray(chunks)) {
        const seen = new Set(briefingSources);
        let g = 0;
        for (const chunk of chunks) {
            const url = chunk?.web?.url || chunk?.web?.uri;
            if (!url || seen.has(url)) continue;
            seen.add(url);
            g += 1;
            const title = chunk?.web?.title;
            refs.push({
                id: `g${g}`,
                url,
                outlet: title,
                title,
                resolved: false,
                // grounding URL은 리다이렉트라 도메인 판별은 title 경유 (triangulation과 동일 원칙)
                tier: tierOf(typeof title === 'string' ? toRegistrableDomain(title) : null),
            });
        }
    }
    return refs;
}

// pass 2: 초안 → DeepDiveStructured. JSON 파싱 실패 시 1회 재시도, 재실패 시 null(기존 에러 경로 준용).
// gateFeedback: 내용 게이트 미달 필드 목록(1차 복구) — 초안에서 재탐색하도록 지시.
async function structureDeepDiveDraft(
    draftText: string,
    sourceRefs: SourceRef[],
    reportType: DeepDiveDomainConfig['reportType'],
    gateFeedback = '',
): Promise<DeepDiveStructured | null> {
    const model = genAI.getGenerativeModel({
        model: DEEP_DIVE_STRUCTURING_MODEL,
        systemInstruction: DEEP_DIVE_STRUCTURING_SYSTEM_PROMPT,
    });
    const catalog = sourceRefs.map(r => ({ id: r.id, label: r.outlet || r.title || r.url }));
    let input = buildStructuringInput(draftText, catalog);
    if (gateFeedback) input += `\n\n# RETRY FEEDBACK (직전 추출 계약 미달)\n${gateFeedback}`;
    const validIds = new Set(sourceRefs.map(r => r.id));

    const PARSE_ATTEMPTS = 2; // 초기 1회 + 파싱 실패 시 재시도 1회
    for (let attempt = 1; attempt <= PARSE_ATTEMPTS; attempt++) {
        try {
            const result = await generateWithRetry(model, {
                contents: [{ role: 'user', parts: [{ text: input }] }],
                generationConfig: { responseMimeType: 'application/json', responseSchema: DEEP_DIVE_RESPONSE_SCHEMA as any },
            });
            const parsed = JSON.parse((await result.response).text());

            // 카탈로그에 없는 sourceId는 폐기 — 창작 금지 규칙(설계 원칙 5)의 코드측 방어선
            for (const dev of Array.isArray(parsed.keyDevelopments) ? parsed.keyDevelopments : []) {
                for (const fact of Array.isArray(dev.facts) ? dev.facts : []) {
                    fact.sourceIds = (Array.isArray(fact.sourceIds) ? fact.sourceIds : []).filter((id: string) => validIds.has(id));
                }
            }
            // anchor 결박도 동일 방어 — 필터 후 비면 anchor_source_binding 게이트가 잡아 복구 경로로 승급
            if (parsed.anchor) {
                parsed.anchor.sourceIds = (Array.isArray(parsed.anchor.sourceIds) ? parsed.anchor.sourceIds : []).filter((id: string) => validIds.has(id));
            }

            // reportType·sourceRefs는 코드가 stamp(스키마에 없음 — 날조 방지)
            return { ...parsed, reportType, sourceRefs } as DeepDiveStructured;
        } catch (e) {
            console.warn(`[DeepDive Structuring] pass 2 시도 ${attempt}/${PARSE_ATTEMPTS} 실패: ${e instanceof Error ? e.message : e}`);
        }
    }
    return null;
}

// Helper: Retry logic for API calls (503/429 지수 백오프) — 파이프라인·이슈 생성 공용
export async function generateWithRetry(model: any, prompt: string | any, retries = 3, delay = 2000) {
    let lastError: any;
    for (let i = 0; i < retries; i++) {
        try {
            return await model.generateContent(prompt);
        } catch (error: any) {
            lastError = error;
            const isOverloaded = error.status === 503 || error.message?.includes('overloaded');
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
    // 모든 재시도 실패 시 마지막 에러 throw
    throw lastError || new Error('Failed to generate content after all retries');
}
