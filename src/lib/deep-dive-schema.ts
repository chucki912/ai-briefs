/**
 * Deep Dive 구조화 출력용 responseSchema + pass 2(구조화) 프롬프트.
 *
 * 경로 B(2-pass) 설계: STEP 0 실측 결과 googleSearch 툴과 responseSchema를 동시에 걸면
 * 요청은 수락되지만 constrained decoding이 비보장(3회 중 2회 JSON 파손, 인용 마커 혼입)이라
 * pass 1(PRO+검색, 초안) → pass 2(FLASH+본 스키마, 추출)로 분리한다.
 *
 * 주의: reportType과 sourceRefs는 스키마에 없다 — LLM이 URL/모드를 날조하지 못하도록
 * 코드가 결정적으로 stamp/구성한다(gemini.ts).
 */
import { ISSUE_RESPONSE_SCHEMA } from './generators/issue-schema';
import type { ContentGateFailure } from './validate-deep-dive';

// soWhat 계약은 일일 브리프와 단일 원천을 공유한다(두 벌 금지 — 설계 원칙 2).
const SO_WHAT_SCHEMA = ISSUE_RESPONSE_SCHEMA.properties.soWhat;

/** Gemini responseSchema (OpenAPI subset). SDK 타입 마찰 회피 위해 호출부에서 as any. */
export const DEEP_DIVE_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        title: { type: 'string', description: '이슈를 관통하는 리포트 제목(초안의 제목/논지 재진술, 새 주장 금지).' },
        meta: {
            type: 'object',
            properties: {
                analysisTarget: { type: 'string', description: '구체적 대상(기업·기술·소재명).' },
                audience: { type: 'string', description: '의사결정자 유형 — CEO/CTO·전략기획·투자심사역 등.' },
                horizon: { type: 'string', description: '분석 기준일 기준 전망 기간 표기(예: "2026-07-16 기준 향후 6~12개월").' },
                perspective: { type: 'string', enum: ['Technology', 'Market', 'Geopolitics', 'Supply Chain'], description: '초안이 택한 관점 1개.' },
            },
            required: ['analysisTarget', 'audience', 'horizon', 'perspective'],
        },
        background: {
            type: 'object',
            properties: {
                whyNow: { type: 'string', description: '왜 지금 이 이슈인가(센싱 배경). 초안에 없으면 빈 문자열.' },
                trajectory: { type: 'string', description: '이 사건이 놓인 과거 궤적(시간 도약). 초안에 없으면 빈 문자열.' },
            },
            required: ['whyNow', 'trajectory'],
        },
        signal: { type: 'string', description: '핵심 신호 — 정량 앵커 수치와 출처 포함(초안에서 추출).' },
        anchor: {
            type: 'object',
            description: '베팅의 크기·시점을 바꾸는 검증 가능한 핵심 수치 1개. 초안에 없는 수치를 만들지 말 것.',
            properties: {
                metric: { type: 'string', description: '무엇의 수치인가.' },
                value: { type: 'string', description: '수치(출처·기준시점 결합 텍스트 그대로).' },
                source: { type: 'string', description: '그 수치의 출처.' },
                asOf: { type: 'string', description: '기준시점.' },
                flipThreshold: { type: 'string', description: '어느 수준을 넘으면 판단이 뒤집히는가(임계치).' },
                sourceIds: { type: 'array', items: { type: 'string' }, description: 'anchor 수치의 출처를 소스 카탈로그의 id(s1…, g1…)로 결박. 특정 불가 시 빈 배열.' },
            },
            required: ['metric', 'value', 'source', 'asOf', 'flipThreshold', 'sourceIds'],
        },
        keyDevelopments: {
            type: 'array',
            minItems: 1,
            description: '핵심 사건/발표별 Fact+Analysis. 초안의 Key Developments에서 추출.',
            items: {
                type: 'object',
                properties: {
                    heading: { type: 'string', description: '구체적 사건/발표명.' },
                    facts: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                text: { type: 'string', description: '검색된 구체적 사실(수치·날짜·주체, 인라인 출처 결합 그대로).' },
                                sourceIds: { type: 'array', items: { type: 'string' }, description: '소스 카탈로그의 id(s1…, g1…)만. 특정 불가 시 빈 배열.' },
                                publishedAt: { type: 'string', description: '발행일(YYYY-MM-DD). 미상이면 빈 문자열.' },
                            },
                            required: ['text', 'sourceIds'],
                        },
                    },
                    analysis: { type: 'array', items: { type: 'string' }, description: '개조식 불릿 — 메커니즘 인과 문장(라벨 부착 금지).' },
                },
                required: ['heading', 'facts', 'analysis'],
            },
        },
        secondOrderMap: {
            type: 'object',
            properties: {
                primaryShift: { type: 'string', description: '이 사건이 드러낸 핵심 구조 변화 1줄.' },
                upstream: { type: 'string', description: '후방(소재·부품·공급망) 파급.' },
                downstream: { type: 'string', description: '전방(완제품·수요처) 파급.' },
                adjacent: { type: 'string', description: '인접 시장이 흡수할 충격/반사이익.' },
            },
            required: ['primaryShift', 'upstream', 'downstream', 'adjacent'],
        },
        soWhat: SO_WHAT_SCHEMA,
        risks: {
            type: 'array',
            description: '도메인별 리스크. 초안의 Risks & Uncertainties에서 추출.',
            items: {
                type: 'object',
                properties: {
                    domain: { type: 'string', enum: ['tech', 'market', 'reg'] },
                    risk: { type: 'string' },
                    downsideCost: { type: 'string', description: '그 리스크가 현실화됐을 때의 하방 비용.' },
                    mitigation: { type: 'string' },
                },
                required: ['domain', 'risk', 'downsideCost', 'mitigation'],
            },
        },
        watchlist: {
            type: 'array',
            minItems: 2,
            description: '선행 지표 2개 이상.',
            items: {
                type: 'object',
                properties: {
                    indicator: { type: 'string', description: '핵심 선행 지표.' },
                    why: { type: 'string', description: '왜 중요한 선행 트리거인가.' },
                    threshold: { type: 'string', description: '피보팅이 필요한 수치·국면.' },
                    killTrigger: { type: 'string', description: '논지가 완전히 무너지는 조건 1줄.' },
                    dataSource: { type: 'string', description: '이 지표를 공개적으로 관측할 수 있는 곳(관측 불가 지표 방지). 초안에 없으면 빈 문자열.' },
                },
                required: ['indicator', 'why', 'threshold', 'killTrigger', 'dataSource'],
            },
        },
    },
    required: ['title', 'meta', 'background', 'signal', 'anchor', 'keyDevelopments', 'secondOrderMap', 'soWhat', 'risks', 'watchlist'],
};

/** pass 2 시스템 프롬프트 — 창작 금지(설계 원칙 5). 구조화는 추출 작업이며 보강이 아니다. */
export const DEEP_DIVE_STRUCTURING_SYSTEM_PROMPT = `당신은 산업 분석 초안을 구조화 JSON으로 변환하는 '추출기'임. 출력은 제공된 JSON 스키마를 따름.

## 절대 규칙 — 창작 금지
1. 초안에 없는 사실·수치·판단·출처를 새로 만들지 말 것. 임무는 '추출과 배치'이지 '보강'이 아님.
2. 초안에서 찾을 수 없는 필드는 빈 문자열("")로 둘 것. 빈 필드가 정답이고, 채우기 위해 지어내는 것이 실패임.
3. 수치는 초안의 표기(출처·기준시점 결합 텍스트)를 그대로 옮길 것. 반올림·환산·재계산 금지.
4. facts[].sourceIds에는 아래 '소스 카탈로그'에 존재하는 id만 사용할 것. 어느 소스인지 특정할 수 없으면 빈 배열로 둘 것.
5. soWhat.actionType은 초안의 결론이 실제로 권하는 것을 따를 것 — 행동 제안이 없으면 'none'이 정답임.
6. 모든 텍스트는 초안의 문체(명사형 종결 개조식)를 유지할 것.
7. anchor: metric이 비율이면 value도 비율, 절대액이면 절대액 — 단위가 일치하는 값을 초안에서 선택할 것.
8. anchor.sourceIds: anchor의 수치가 어느 출처에서 왔는지 소스 카탈로그의 id로 결박할 것(fact와 동일 규칙). 특정 불가 시 빈 배열.
9. 문체: 모든 필드 텍스트는 개조식 종결(~함/~임/~전망)로 작성. 서술형 종결(~습니다/~한다/~있다) 금지. 초안이 서술형이면 개조식으로 변환하되 내용은 변경 금지.
10. soWhat.action의 costIfWrong(베팅이 틀렸을 때 비용)과 costIfMissed(움직이지 않았는데 맞았을 때 비용)는 초안의 리스크·비용 서술에서 적극적으로 찾아 채울 것. 이 두 필드는 반복적으로 누락되는 항목임.
11. 초안의 귀속 표현('~라고 주장함', '~의 자체 발표 기준')과 유보·반박 문구는 추출 시 제거하지 말고 해당 필드에 보존할 것. 귀속 제거는 내용 변경임.`;

// content gate 실패 path → pass 1(검색·분석) 재실행 시 재강조할 계약 항목 문구.
// 초안 자체에 판단 내용이 없어 추출이 불가능했던 경우를 위한 2차 복구 피드백.
const CONTRACT_HINTS: [RegExp, string][] = [
    [/^soWhat\.action\.costIfWrong/, "베팅이 틀렸을 때의 비용(costIfWrong)"],
    [/^soWhat\.action\.costIfMissed/, "안 움직였는데 맞았을 때의 비용(costIfMissed)"],
    [/^soWhat\.action/, "행동 판단(action) — 무엇을/되돌림 가능 여부/양쪽 비용"],
    [/^soWhat\.observe/, "관측 판단(observe) — 셀 수 있는 지표와 주기"],
    [/^soWhat\.killTrigger/, "폐기 트리거(killTrigger) — 날짜·수치 포함"],
    [/^soWhat\./, "So What 4요소(추론 유지 시 변화/미확인 변수/행동 판단/폐기 트리거)"],
    [/^anchor\.sourceIds/, "Anchor 수치의 출처 결박 — 어느 소스의 수치인지 식별 가능하게 인라인 출처를 결합해 서술"],
    [/^anchor\.flipThreshold/, "판단이 뒤집히는 임계치(flipThreshold) — 수치 필수"],
    [/^anchor\./, "Anchor — 지표명/수치/출처/기준시점/임계치 전부 명시"],
    [/^watchlist/, "Watchlist 2개 이상 — 지표/Why/Threshold(수치)/폐기 트리거(수치·날짜)/공개 관측처(dataSource)"],
    [/^keyDevelopments.*sourceIds/, "각 Fact의 인라인 출처 결합(어느 소스의 사실인지 식별 가능하게)"],
    [/^keyDevelopments/, "Key Developments 2건 이상 — Fact(수치·날짜·주체)+Analysis"],
    [/^background\./, "센싱 배경(Why Now)과 과거 궤적(Trajectory)"],
    [/^secondOrderMap\./, "Second-Order Map 4요소(Primary Shift/Upstream/Downstream/Adjacent)"],
    [/^risks/, "Risks — 리스크+하방 비용+Mitigation"],
    [/^signal/, "Signal — 정량 수치와 출처 포함"],
];

/** content gate 실패를 pass 1 재실행 프롬프트용 계약 항목 재강조 문구로 변환. */
export function buildPass1ContentFeedback(failures: ContentGateFailure[]): string {
    const hints = new Set<string>();
    for (const f of failures) {
        // 티어 실패는 path가 아니라 rule로 식별 — 출처 '품질' 요구를 재강조
        if (f.rule === 'anchor_source_tier') {
            hints.add('정량 앵커는 IR 자료·실적발표·1차 보도(통신사·주요 경제지) 수준에서 확보할 것. 집계·리라이팅 사이트의 수치 금지');
            continue;
        }
        const hit = CONTRACT_HINTS.find(([re]) => re.test(f.path));
        hints.add(hit ? hit[1] : `${f.path}: ${f.detail}`);
    }
    return `직전 리포트는 다음 계약 항목의 판단 내용이 미달이었음: ${[...hints].join(' / ')}. ` +
        `이번 초안에서는 해당 항목을 명시적인 소제목과 함께, 구체적 수치·날짜·출처를 결합해 빠짐없이 서술할 것. ` +
        `판단 필드(임계치·트리거·비용)를 서술 없이 비워 두는 것은 작성 실패임.`;
}

/** pass 2 사용자 입력 빌더: 초안 + 소스 카탈로그(코드가 부여한 id 목록). */
export function buildStructuringInput(draft: string, sourceCatalog: { id: string; label: string }[]): string {
    const catalogLines = sourceCatalog.length
        ? sourceCatalog.map(s => `- ${s.id}: ${s.label}`).join('\n')
        : '(소스 카탈로그 없음 — sourceIds는 전부 빈 배열로 둘 것)';
    return `# 소스 카탈로그 (facts[].sourceIds는 이 id만 사용)
${catalogLines}

# 분석 초안 (이 텍스트가 유일한 원천 — 여기 없는 내용은 빈 문자열)
${draft}`;
}
