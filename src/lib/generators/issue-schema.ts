/**
 * 구조화 이슈 생성용 responseSchema + 프롬프트 빌더 (정규식 파싱 폐기).
 * Gemini structured output(responseSchema)으로 스키마를 강제한다.
 *
 * 인덱스 규약:
 *  - keyFact.sourceIndices = 프롬프트의 [n] 뉴스 번호(1-based)
 *  - keyInsight.restsOnFactIndices = keyFacts 배열의 1-based 위치
 */
import { KEY_INSIGHT_GUIDE } from '../analyzers/key-insight';

export const ALLOWED_CATEGORIES = [
    'Platform & Ecosystem',
    'Geopolitics & AI Regulation',
    'Computing Infrastructure',
    'AI Safety & Ethics',
    'Investment & Capital',
    'Enterprise AI Adoption',
    'Model & Technology',
    'Sovereign AI & Policy',
] as const;

/** Gemini responseSchema (OpenAPI subset). SDK 타입 마찰 회피 위해 호출부에서 as any. */
export const ISSUE_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        headline: { type: 'string', description: '한국어 헤드라인(30자 이내). keyFact 사건의 재진술이어야 하며 새 주장/추론/수사를 도입하지 말 것.' },
        thesis: { type: 'string', description: '이 카드의 단일 논지 1문장(100자 이내). 사건이 아니라 주장 명제. (singleTopicStatement+oneLineSummary 통합)' },
        category: { type: 'string', enum: [...ALLOWED_CATEGORIES], description: '허용 목록 중 1개' },
        excludedFacts: { type: 'array', items: { type: 'string' }, description: '주제와 무관하여 제외한 사실 1개 이상' },
        keyFacts: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            description: '최소 1개, 최대 3개. 보도된 사실만(메커니즘·인과·해석·의도 금지). 근거 있는 사실이 3개 미만이면 있는 만큼만 쓰고, 개수를 채우기 위해 사실을 만들지 말 것.',
            items: {
                type: 'object',
                properties: {
                    text: { type: 'string', description: '보도 사실만: 수치·주체·날짜. 해석 금지.' },
                    sourceIndices: { type: 'array', items: { type: 'integer' }, description: '이 사실의 근거 뉴스 번호([n], 1-based). 최소 1개 필수.' },
                    publishedAt: { type: 'string', description: '해당 사실의 발행일(ISO 또는 YYYY-MM-DD). 미상이면 빈 문자열.' },
                },
                required: ['text', 'sourceIndices'],
            },
        },
        keyInsight: {
            type: 'object',
            properties: {
                text: { type: 'string', description: '판단만 담는 Key Insight 2문장 내외: [구조적 변화 → 기업 경쟁력·비용·시장 접근성에 주는 영향]. 행동 제언·처방("~해야 한다", "경영진은…")을 절대 쓰지 말 것(행동은 soWhat 소관). "~하고 있습니다 / ~일 수 있습니다"로 끝낼 것.' },
                restsOnFactIndices: { type: 'array', items: { type: 'integer' }, description: '이 인사이트가 근거하는 keyFacts의 위치(1-based). 최소 1개.' },
                confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: '이 인사이트 근거의 확실성. 근거 fact 수·출처 다양성이 낮으면 high 금지.' },
                mundaneAlternative: { type: 'string', description: '이 현상의 지루하고 평범한 설명 1문장(과잉 해석의 반례). 필수.' },
            },
            required: ['text', 'restsOnFactIndices', 'confidence', 'mundaneAlternative'],
        },
        soWhat: {
            type: 'object',
            properties: {
                ifInferenceHolds: { type: 'string', description: '이 추론이 사실로 굳어질 때 바뀌는 것(사실 진위가 아니라 추론에 조건).' },
                unknown: { type: 'string', description: '아직 확인되지 않은 핵심 변수.' },
                actionType: { type: 'string', enum: ['act', 'observe', 'none'], description: "먼저 고를 것. 지금 실행='act', 관측만='observe', 할 것 없음='none'(정당한 선택)." },
                action: {
                    type: 'object',
                    description: "actionType='act'일 때만 채울 것.",
                    properties: {
                        what: { type: 'string', description: '구체적 행동(대상+행동).' },
                        reversible: { type: 'boolean', description: '되돌릴 수 있는가.' },
                        costIfWrong: { type: 'string', description: '움직였는데 틀렸을 때의 비용.' },
                        costIfMissed: { type: 'string', description: '안 움직였는데 맞았을 때의 비용.' },
                    },
                    required: ['what', 'reversible', 'costIfWrong', 'costIfMissed'],
                },
                observe: {
                    type: 'object',
                    description: "actionType='observe'일 때만 채울 것.",
                    properties: {
                        metric: { type: 'string', description: '무엇을 세는가(측정 가능한 지표). "지켜본다"만으론 불가.' },
                        cadence: { type: 'string', description: '관측 주기.' },
                    },
                    required: ['metric', 'cadence'],
                },
                killTrigger: { type: 'string', description: '이 논지가 무너지는 조건. 반드시 날짜 또는 수치 포함.' },
            },
            required: ['ifInferenceHolds', 'unknown', 'actionType', 'killTrigger'],
        },
        hashtags: { type: 'array', items: { type: 'string' } },
    },
    required: ['headline', 'thesis', 'category', 'keyFacts', 'keyInsight', 'soWhat'],
};

export function buildIssuePrompt(indexedNews: string, frameworkLines: string, recentContextStr: string, today: string): string {
    return `당신은 **글로벌 AI 산업 전략 애널리스트**입니다. 아래 뉴스 클러스터를 근거로 구조화된 브리프 카드 1장을 작성하십시오.
출력은 제공된 JSON 스키마를 반드시 따릅니다(스키마 외 필드 금지).

## 오늘 날짜: ${today}
- 모든 미래 시점(특히 killTrigger)은 **반드시 오늘(${today}) 이후**여야 합니다. 과거 연도(예: 2025)를 쓰지 마십시오. 학습 데이터 기준이 아니라 오늘 날짜 기준으로 판단하십시오.

## 뉴스 클러스터 (번호 부여됨 — sourceIndices는 이 번호를 참조)
${indexedNews}

## 적용 분석 프레임워크
${frameworkLines}

## 브리프 시리즈 컨텍스트
${recentContextStr}

## 작성 규칙
1. **headline**: keyFact에 있는 사건의 재진술. 새 주장·추론·지정학 수사를 도입하지 말 것. 30자 이내 한국어.
2. **thesis**: 이 카드의 단일 논지 1문장(주장 명제). 사건 나열 금지.
3. **keyFacts (최소 1개, 최대 3개)**: 보도된 사실만(수치·주체·날짜). **메커니즘·인과·해석·의도 추정 절대 금지**(그건 keyInsight 소관). 각 fact의 \`sourceIndices\`에 그 사실을 실제로 뒷받침하는 뉴스 번호를 **1개 이상** 넣을 것. **입력에 근거 있는 사실이 3개 미만이면 그 개수만큼만 작성할 것 — 3개를 채우기 위해 사실을 만들지 말 것.**
4. **keyInsight**:
${KEY_INSIGHT_GUIDE}
   - \`restsOnFactIndices\`: 이 인사이트가 근거하는 keyFacts 위치(1-based)를 명시.
   - \`confidence\`: 근거 fact가 적거나 출처가 단일하면 'high'를 쓰지 말 것.
   - \`mundaneAlternative\`: 이 현상의 '지루하고 평범한 설명'을 반드시 1문장 적을 것(과잉 해석 반례).
   - 프레임워크가 지정된 경우에만 렌즈로 참고하되 명칭·수사를 본문에 복제하지 말 것. none이면 언급하지 말 것.
5. **soWhat**:
   - **actionType을 먼저 고를 것**: 지금 실행할 게 있으면 'act', 관측만 필요하면 'observe', **지금 할 것이 없으면 'none'(완전히 정당한 선택 — 억지 베팅 금지)**.
   - 'act'이면 action(what/reversible/costIfWrong/costIfMissed) 전부 채울 것. **costIfMissed(안 움직였는데 맞았을 때 비용)도 반드시**.
   - 'observe'이면 observe(metric/cadence). metric은 셀 수 있는 지표여야 함.
   - 'none'이면 action·observe를 비울 것.
   - confidence가 'low'이면 actionType은 'observe' 또는 'none'만.
   - \`killTrigger\`: 논지가 무너지는 조건. **오늘(${today}) 이후의 미래 날짜** 또는 관측 가능한 수치 임계를 포함할 것. 과거 날짜 금지.
6. 문체: 한국어, 과장된 지정학 수사(패권/영토/서막/포위망 등) 금지. keyFacts는 개조식, keyInsight·soWhat은 완성형 문장.`;
}
