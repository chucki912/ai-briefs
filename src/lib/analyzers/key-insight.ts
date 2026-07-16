/**
 * Key Insight 생성 가드레일 (공유 모듈)
 *
 * 일일 브리프(AI·에너지·반도체·데이터센터·정책 등 모든 산업 동향)의 마지막 심층
 * 인사이트를, HBR·McKinsey 급 경영전략 보고서 문체의 "Key Insight"로 통일한다.
 *
 * 핵심 3단 구조:  산업의 구조적 변화 → 기업에 미치는 영향 → 경영진이 취해야 할 대응
 *
 * 특정 기사/기업/국가에 하드코딩하지 않고, 어떤 산업 클러스터에도 동일하게 적용되는
 * 일반화된 프롬프트 지시문 + 후처리 검증 + (치명적 위반 시) 최대 1회 재생성 로직을 제공한다.
 */

/** insight JSON 필드에 넣을 스키마 설명(짧은 버전). 프롬프트 출력 형식 블록에서 사용. */
export const KEY_INSIGHT_FIELD_SPEC =
    'HBR·McKinsey 급 전략 보고서 문체의 Key Insight (2문장 내외, 완성형 문장). ' +
    'insight는 **판단만** 담습니다: [산업의 구조적 변화 → 그 변화가 기업 경쟁력·비용·시장 접근성에 주는 영향]. ' +
    '**행동 제언·처방("~해야 한다", "경영진은 …")을 절대 쓰지 마십시오 — 행동은 soWhat 전담입니다.** ' +
    'keyFacts 개별 사실을 되풀이하지 말고 상위 구조 변화로 압축할 것.';

/** insight 세부 지침(원칙 A/B + 판단-한정). AI/배터리 프롬프트가 공유. */
export const KEY_INSIGHT_GUIDE = `- **insight = "Key Insight" (판단만 — 처방 금지)**:
  insight는 "무엇이 일어나고 있고, 왜 중요한가"라는 판단만 서술합니다. 2문장 내외.
  1) **[구조적 변화]** 이 클러스터의 여러 신호가 공통으로 보여주는 산업 구조의 상위 변화 1가지.
  2) **[기업 영향]** 그 변화가 기업의 경쟁력·비용·시장 접근성에 주는 영향.
  ★ **행동/제언/베팅 금지**: "경영진은 …해야 한다", "…을 확보해야 한다", "…를 준비해야 한다" 같은 처방을 insight에 절대 쓰지 마십시오. 행동은 soWhat(actionType/action/observe)이 전담합니다. insight가 "~해야 한다"로 끝나면 실패입니다.

  ★ 원칙 A — 의도 추정 금지, 구조적 결과만 서술:
    - 특정 국가·정부·기업의 '숨은 의도'를 근거 없이 단정하지 마십시오.
      (❌ "미국이 후발주자를 제거하려 한다", "빅테크가 기술 카르텔을 영속화하려 한다")
    - 대신 구조적 결과로 환원하십시오.
      (⭕ "안전 규제가 강화될수록 검증·규제 대응 비용이 증가해 대형 사업자에 상대적으로 유리한 시장 구조가 형성될 수 있다")
    - 근거가 부족하면 "확대될 가능성이 있다", "상대적으로 유리할 수 있다" 처럼 불확실성을 명시하십시오.

  ★ 원칙 B — 개별 뉴스 나열 금지, 하나의 상위 구조 변화로 압축:
    - 개별 기사를 나열하거나 근거 없이 인과로 잇지 말고, 공통으로 가리키는 상위 변화를 도출하십시오.
    - 직접 인과의 근거가 없으면 "~때문에", "~로 인해" 같은 인과 표현을 쓰지 마십시오.

  ★ 문체 제약:
    - 과장된 지정학 수사("패권", "말살", "카르텔", "헤게모니", "게임체인저", "초격차") 및 근거보다 강한 확정적 결론 금지.
    - keyFacts·headline·thesis의 사실관계를 다시 나열하지 말 것(중복 금지).`;

/** 자체 검증 체크리스트 항목(문자열 배열). */
export const KEY_INSIGHT_CHECKLIST: string[] = [
    'insight가 [구조적 변화 → 기업 영향] 판단만 담고, 행동 제언("~해야 한다")을 포함하지 않았는가? (행동은 soWhat 소관)',
    'insight가 근거 없이 특정 주체의 숨은 의도를 단정하지 않았는가? (근거 부족 시 "~일 수 있다" 등으로 완화)',
    '개별 뉴스를 나열하지 않고 하나의 상위 산업 구조 변화로 압축했는가? (직접 인과 근거 없으면 인과 표현 배제)',
];

// ── 검증 결과 타입 ──────────────────────────────────────────────────────────

export type KeyInsightIssueCode =
    | 'empty' //          insight가 비어 있음
    | 'sentence_count' //  2~3문장 조건 위반
    | 'intent_assertion' // 근거 없는 의도 단정
    | 'geopolitics_hype' // 과장된 패권·퇴출·완전 차단 등 확정 표현
    | 'style_hype' //      게임체인저·초격차 등 문체 과장(약한 경고)
    | 'unsupported_causal'; // 직접 근거 없는 강한 인과 주장

export type KeyInsightSeverity = 'warning' | 'error';

export interface KeyInsightValidationIssue {
    code: KeyInsightIssueCode;
    severity: KeyInsightSeverity;
    message: string;
}

export interface KeyInsightValidation {
    /** 위반(warning/error 포함)이 전혀 없으면 true */
    ok: boolean;
    /** error 심각도 위반이 하나라도 있으면 true → 재생성 대상 */
    hasError: boolean;
    sentenceCount: number;
    issues: KeyInsightValidationIssue[];
    /** 하위호환: issues의 message 배열 */
    warnings: string[];
}

// ── 패턴 정의(일반화, 특정 고유명사 하드코딩 없음) ───────────────────────────

/** 근거 없는 의도 단정 패턴. */
const INTENT_ASSERTION_PATTERNS: RegExp[] = [
    /(제거|말살|고사|봉쇄|차단|퇴출|축출|밀어내|짓밟|배제)(하려|하기\s*위해|시키려|하려는|려는|하고|하며|하여)/,
    /(영속화|영구화|독점화)(하려|하려는|하기\s*위해)/,
    /(속셈|흑심|노림수|저의|꼼수)/,
    /의도(가|를)?\s*(분명|명백|노골|숨기|드러|담)/,
    /의도적으로/,
    /작정(한|하고|하)/,
    /겨냥한\s*(포석|것|수순)/,
    // 특정 주체가 '~하기 위해 ~를 기획/설계/추진했다'는 목적-의도 서사
    /(위해|위하여)\s*[가-힣\s,·]*(기획|설계|고안|추진|마련)(했|하였|한\s*것|한\s*장치)/,
    /(기득권|독점\s*체제|기존\s*질서)[을를]?\s*(지키|유지|공고|보호)/,
    /명분\s*(아래|하에|으로)/,
    /장치로\s*작용/,
];

/** 과장된 지정학·패권 수사(확정적으로 쓰면 치명적). */
const GEOPOLITICS_HYPE_PATTERNS: RegExp[] = [
    /카르텔/,
    /패권(을|\s|주의)?/,
    /헤게모니/,
    /완전(히)?\s*(차단|봉쇄|배제)/,
    /(시장에서\s*)?(말살|퇴출|축출|고사)/,
];

/** 문체 과장(약한 경고 수준). */
const STYLE_HYPE_PATTERNS: RegExp[] = [
    /게임\s*체인저/,
    /초격차/,
    /세계\s*최고/,
    /거대한\s*물줄기/,
    /판을\s*뒤집/,
    /역사적\s*(대)?전환/,
    /혁명적/,
];

/** 불확실성 완화 표현(hedge). */
const HEDGE_PATTERN =
    /(가능성이\s*있|수\s*있|수도\s*있|일\s*수\s*있|전망|변수로\s*작용|상대적으로|여지가|보인다|우려|예상|판단됨)/;

/** 강한 인과/함의 표현. 명시적 연결어 + '전제/초석/담보'류 강한 필요조건 단정만 포함.
 *  (가속화·견인·기반이 된다 등 일반 서술어는 정상 문장에서도 흔해 precision 위해 제외) */
const CAUSAL_PATTERN =
    /(때문에|로\s*인해|으로\s*인해|초래|야기|전제로|전제되어|초석(이다|으로)|담보한|으로\s*귀결)/;

/**
 * 문장 수 계산. 완성형 문장(마침표/물음표/느낌표 종결 또는 '~다' 종결)을 센다.
 * 소수점(3.5) 오탐을 방지한다.
 */
export function countSentences(text: string): number {
    const t = (text || '').trim();
    if (!t) return 0;
    const cleaned = t.replace(/(\d)\.(\d)/g, '$1$2'); // 소수점 오탐 제거
    const punct = (cleaned.match(/[.!?。]/g) || []).length;
    if (punct > 0) return punct;
    return (cleaned.match(/다(?=\s|$|["'”’)\]])/g) || []).length || 1;
}

/**
 * 생성된 Key Insight(insight 필드)를 후처리 검증한다.
 * error 심각도가 하나라도 있으면 재생성 대상(hasError=true)이다.
 */
export function validateKeyInsight(insight: string): KeyInsightValidation {
    const issues: KeyInsightValidationIssue[] = [];
    const text = (insight || '').trim();

    if (!text) {
        const issue: KeyInsightValidationIssue = {
            code: 'empty',
            severity: 'error',
            message: 'insight가 비어 있음',
        };
        return { ok: false, hasError: true, sentenceCount: 0, issues: [issue], warnings: [issue.message] };
    }

    // 1) 분량 (2~3문장). 1문장/5문장+ 는 치명적(error), 4문장은 경고.
    const sentenceCount = countSentences(text);
    if (sentenceCount < 2 || sentenceCount >= 5) {
        issues.push({
            code: 'sentence_count',
            severity: 'error',
            message: `분량 위반(치명): ${sentenceCount}문장 (2~3문장 필요)`,
        });
    } else if (sentenceCount === 4) {
        issues.push({
            code: 'sentence_count',
            severity: 'warning',
            message: `분량 경고: ${sentenceCount}문장 (2~3문장 권장)`,
        });
    }

    // 2) 의도 단정
    for (const re of INTENT_ASSERTION_PATTERNS) {
        const m = text.match(re);
        if (m) {
            issues.push({ code: 'intent_assertion', severity: 'error', message: `의도 단정 표현 감지: "${m[0]}"` });
            break;
        }
    }

    // 3) 과장 지정학 수사(치명)
    for (const re of GEOPOLITICS_HYPE_PATTERNS) {
        const m = text.match(re);
        if (m) {
            issues.push({ code: 'geopolitics_hype', severity: 'error', message: `과장/지정학 수사 감지: "${m[0]}"` });
            break;
        }
    }

    // 3-b) 문체 과장(경고)
    for (const re of STYLE_HYPE_PATTERNS) {
        const m = text.match(re);
        if (m) {
            issues.push({ code: 'style_hype', severity: 'warning', message: `과장 문체 감지(경고): "${m[0]}"` });
            break;
        }
    }

    // 4) 완화 없는 강한 인과 주장
    if (CAUSAL_PATTERN.test(text) && !HEDGE_PATTERN.test(text)) {
        issues.push({
            code: 'unsupported_causal',
            severity: 'error',
            message: '직접 인과 주장에 불확실성 완화 표현이 없음(근거보다 강한 결론 가능성)',
        });
    }

    // (경영진 대응/액션 검사는 폐기됨 — insight는 판단만, 행동은 soWhat 소관. AM)

    const hasError = issues.some(i => i.severity === 'error');
    return {
        ok: issues.length === 0,
        hasError,
        sentenceCount,
        issues,
        warnings: issues.map(i => i.message),
    };
}

// ── 재생성(최대 1회) ────────────────────────────────────────────────────────

/** 원문에서 순수 Key Insight 본문만 정제(코드펜스/라벨/따옴표 제거). */
export function cleanInsightText(raw: string): string {
    let t = (raw || '').trim();
    // 코드펜스 제거
    t = t.replace(/^```[a-zA-Z]*\s*/,'').replace(/```\s*$/,'').trim();
    // "Key Insight:" / "■ Key Insight" 같은 라벨 제거
    t = t.replace(/^■?\s*(key\s*insight|키\s*인사이트|인사이트)\s*[:：]?\s*/i, '').trim();
    // 감싼 따옴표 제거
    t = t.replace(/^["'“”「『]\s*/, '').replace(/\s*["'“”」』]$/, '').trim();
    return t;
}

/** 재생성 입력 컨텍스트(사실관계 등). */
export interface KeyInsightRegenContext {
    facts: string[];
    title?: string;
    audience?: string;
}

/** 검증 위반 코드 → 재생성 지시문(동적 구성). */
function issueToInstruction(code: KeyInsightIssueCode): string | null {
    switch (code) {
        case 'empty':
            return 'Key Insight 본문을 반드시 2~3문장으로 작성할 것';
        case 'sentence_count':
            return '총 2~3문장으로 맞출 것 (너무 짧거나 길지 않게)';
        case 'intent_assertion':
            return '특정 국가·정부·기업의 숨은 의도를 근거 없이 단정하지 말고, 구조적 결과(비용·경쟁구도 변화 등)로 서술할 것';
        case 'geopolitics_hype':
            return '패권·카르텔·완전 차단·퇴출 등 과장된 지정학 수사를 쓰지 말고 중립적·검증 가능한 표현으로 바꿀 것';
        case 'style_hype':
            return '게임체인저·초격차 등 과장 문체를 배제할 것';
        case 'unsupported_causal':
            return '직접 근거가 없는 사건을 원인-결과로 단정하지 말고, 근거가 약하면 "~일 수 있다/가능성이 있다"로 완화할 것';
        default:
            return null;
    }
}

/** 재생성 프롬프트 동적 구성(전체 재생성 아님, Key Insight만 수정). */
export function buildKeyInsightRegenPrompt(
    previousInsight: string,
    ctx: KeyInsightRegenContext,
    issues: KeyInsightValidationIssue[],
): string {
    const violations = issues
        .filter(i => i.severity === 'error')
        .map(i => `- ${i.message}`)
        .join('\n');

    const instructions = Array.from(
        new Set(
            issues
                .filter(i => i.severity === 'error')
                .map(i => issueToInstruction(i.code))
                .filter((s): s is string => !!s),
        ),
    );
    const extraConditions = instructions.map((s, i) => `${i + 1}. ${s}`).join('\n');

    return `다음 Key Insight는 품질 검증을 통과하지 못했습니다. 원래 확인된 사실관계 범위 안에서 Key Insight 본문만 다시 작성하세요.

[기존 Key Insight]
${previousInsight || '(비어 있음)'}

[검증 위반]
${violations || '- 구조/품질 위반'}

[원래 확인된 사실]
${ctx.facts.map(f => `- ${f}`).join('\n') || '- (제공된 사실 없음)'}
${ctx.audience ? `\n[대상 독자] ${ctx.audience}` : ''}

원래 사실관계에 없는 내용을 새로 추가하거나 수치를 지어내지 말고, 아래 조건을 지켜 Key Insight만 다시 작성하세요.

기본 구조 조건:
1. 여러 신호가 보여주는 산업의 구조적 변화를 첫 문장에 제시
2. 두 번째 문장에서 기업의 경쟁력·비용·시장 접근성에 미치는 영향을 설명
3. 마지막 문장에서 경영진의 구체적 대응(대상+행동)을 제시
4. 총 2~3문장, 완성형 문장, 전략 보고서 문체

추가 수정 조건:
${extraConditions || '- (없음)'}

출력은 Key Insight 본문 텍스트만 출력하세요. 제목·라벨·따옴표·설명을 붙이지 마세요.`;
}

/** 재생성용 생성기(의존성 주입). 프롬프트를 받아 순수 텍스트를 반환. */
export type KeyInsightGenerator = (regenPrompt: string) => Promise<string>;

export interface ValidatedKeyInsightResult {
    /** 최종 선택된 insight */
    insight: string;
    /** 1차 생성(정제 후) insight 원문 — 게이트 recall/false-negative 측정용 */
    firstInsight: string;
    /** 재생성 insight(정제 후). 재생성 안 했거나 실패면 undefined */
    regenInsight?: string;
    firstValidation: KeyInsightValidation;
    /** 재생성을 실제로 시도했는지 */
    regenerated: boolean;
    /** 재생성 결과 검증(재생성 안 했으면 undefined) */
    regenValidation?: KeyInsightValidation;
    /** 최종 선택 결과의 검증 */
    finalValidation: KeyInsightValidation;
    chosen: 'first' | 'regenerated';
    /** 재생성으로 발생한 API 호출 수(0 또는 1) */
    apiCalls: number;
    /** 재생성기 호출 중 오류 발생 여부 */
    regenError: boolean;
}

/** 낮을수록 좋음: error 1건 = 10, warning 1건 = 1. */
function validationScore(v: KeyInsightValidation): number {
    return v.issues.reduce((acc, i) => acc + (i.severity === 'error' ? 10 : 1), 0);
}

/**
 * Key Insight를 검증하고, 치명적(error) 위반이 있을 때만 최대 1회 재생성한다.
 * - 정상(=error 없음)이면 재생성하지 않아 추가 API 호출이 발생하지 않는다.
 * - 재생성 결과가 1차보다 개선되었을 때만 채택하고, 아니면 1차를 유지한다(안전 fallback).
 * - 재생성기 호출이 실패해도 예외를 던지지 않고 1차 결과를 반환한다(파이프라인 비중단).
 */
export async function ensureValidKeyInsight(
    firstInsightRaw: string,
    ctx: KeyInsightRegenContext,
    regenerate: KeyInsightGenerator,
): Promise<ValidatedKeyInsightResult> {
    const firstInsight = cleanInsightText(firstInsightRaw);
    const firstValidation = validateKeyInsight(firstInsight);

    // 치명적 위반이 없으면 재생성하지 않음
    if (!firstValidation.hasError) {
        return {
            insight: firstInsight,
            firstInsight,
            firstValidation,
            regenerated: false,
            finalValidation: firstValidation,
            chosen: 'first',
            apiCalls: 0,
            regenError: false,
        };
    }

    const regenPrompt = buildKeyInsightRegenPrompt(firstInsight, ctx, firstValidation.issues);

    let regenInsight = '';
    let regenError = false;
    try {
        regenInsight = cleanInsightText(await regenerate(regenPrompt));
    } catch {
        regenError = true;
    }

    // 재생성 실패 또는 빈 결과 → 1차 유지(fallback)
    if (regenError || !regenInsight) {
        return {
            insight: firstInsight,
            firstInsight,
            regenInsight: regenError ? undefined : regenInsight,
            firstValidation,
            regenerated: true,
            regenValidation: regenError ? undefined : validateKeyInsight(regenInsight),
            finalValidation: firstValidation,
            chosen: 'first',
            apiCalls: 1,
            regenError,
        };
    }

    const regenValidation = validateKeyInsight(regenInsight);

    // 개선되었을 때만 채택(점수 낮을수록 좋음)
    const improved = validationScore(regenValidation) < validationScore(firstValidation);
    const chosen: 'first' | 'regenerated' = improved ? 'regenerated' : 'first';

    return {
        insight: improved ? regenInsight : firstInsight,
        firstInsight,
        regenInsight,
        firstValidation,
        regenerated: true,
        regenValidation,
        finalValidation: improved ? regenValidation : firstValidation,
        chosen,
        apiCalls: 1,
        regenError: false,
    };
}

/** 결과를 민감정보 없이 요약 로깅한다(기사 본문/키/facts 미포함). */
export function logKeyInsightResult(label: string, result: ValidatedKeyInsightResult): void {
    if (!result.regenerated && result.finalValidation.ok) return; // 완전 정상은 조용히 통과

    const codes = (v?: KeyInsightValidation) => (v ? v.issues.map(i => `${i.code}:${i.severity}`).join(',') || 'clean' : 'n/a');
    const payload = {
        label,
        firstIssues: codes(result.firstValidation),
        regenerated: result.regenerated,
        regenIssues: codes(result.regenValidation),
        chosen: result.chosen,
        regenError: result.regenError,
        finalOk: result.finalValidation.ok,
        finalHasError: result.finalValidation.hasError,
        apiCalls: result.apiCalls,
    };

    if (result.finalValidation.hasError || result.regenError) {
        console.warn('[Key Insight][UNRESOLVED]', JSON.stringify(payload));
    } else {
        console.log('[Key Insight][fixed]', JSON.stringify(payload));
    }
}
