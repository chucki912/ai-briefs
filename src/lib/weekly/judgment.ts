/**
 * PASS 5 — 판단 레이어 (시사점 / 킬 트리거 전용) (T5)
 *
 * 결정: 저장소가 Gemini 전용이므로 판단도 Gemini로 수행한다. 단 judgmentProvider
 * 인터페이스로 분리해 향후 모델 교체(예: Claude)가 설정 변경으로 가능하게 한다.
 * 재사용 대상은 호출 경로/스키마/에러핸들링이며, 프롬프트는 주간 전용 신규 작성이다
 * (기존 SoWhatV2 프롬프트는 단일 일일 항목용이라 그대로 쓰지 않는다).
 *
 * 규칙:
 *   - 시사점: 본문 사실 재요약 금지. 조건부 전개 + 우리 의사결정 지목 + 틀릴 수 있는 지점.
 *     금지 어미("주목된다/필요하다/중요하다/예의주시"…)로 끝나지 않는다.
 *   - 시사점은 등급/motionTypes/priorEvidence/관측주차를 반영한다.
 *   - 킬 트리거: "만약 <관측 가능 사건>이 <시점>까지 발생하면 이 판단을 철회한다".
 *     관측 주체·확인 경로 명시, 반증 가능해야 한다.
 *   - 등급 C: 단정하지 말고 무엇을 더 관측해야 판단이 서는지 쓴다.
 * (금지어미·8-gram 중복·C단정 검사는 PASS 7 DoD에서 코드로 강제 — T6)
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PRO_MODEL } from '../gemini-models';
import { generateWithRetry } from '../deep-dive-pipeline';
import { IMPLICATION_FORBIDDEN_ENDINGS, LENGTH } from '@/configs/weekly-house-style';
import type { Grade, MotionTypeCode, PriorEvidence } from './grade';

export interface JudgmentInput {
    threadKey: string;
    label: string;
    grade: Grade;
    motionTypes: MotionTypeCode[];
    priorWeeksInternal: number;
    priorEvidence: PriorEvidence[];
    observedDates: string[];
    bodyText: string;               // 맥락용(재요약 금지)
    regenFeedback?: string;         // 직전 DoD 미달 교정 지시
}

export interface Judgment {
    implications: string;           // [시사점]
    killTrigger: string;            // 반증 조건(날짜 + 관측 주체)
    nextWeekCheck: string;          // 검증 이벤트 + 예정일
}

export interface JudgmentProvider {
    readonly name: string;
    generate(input: JudgmentInput): Promise<Judgment>;
}

const JUDGMENT_SCHEMA = {
    type: 'object',
    properties: {
        implications: { type: 'string', description: '[시사점] 조건부 전개 + 우리 의사결정 지목 + 틀릴 수 있는 지점' },
        killTrigger: { type: 'string', description: '만약 <관측가능 사건>이 <시점>까지 발생하면 이 판단을 철회한다. 관측 주체 명시' },
        nextWeekCheck: { type: 'string', description: '다음 주 검증 이벤트와 예정 날짜' },
    },
    required: ['implications', 'killTrigger', 'nextWeekCheck'],
} as const;

export function buildJudgmentPrompt(input: JudgmentInput): string {
    const priorLines = input.priorEvidence.map(e => `- [${e.source}] ${e.observedAt} ${e.mechanismNote ?? ''}`).join('\n') || '(선행 관측 없음)';
    const isC = input.grade === 'C';
    return `당신은 LG경영연구원 주간 인텔리전스의 판단 레이어다. 독자는 CEO·경영진이다.
아래 스레드에 대해 [시사점]과 킬 트리거, 다음 주 확인 포인트만 생성하라. 본문 사실을 재요약하지 마라.

## 판정 사실(반영 필수)
- 등급: ${input.grade}
- 운동유형(확정): ${input.motionTypes.join(', ') || '없음'}
- 내부 선행 관측 주차: ${input.priorWeeksInternal}
- 관측 일자 수: ${input.observedDates.length}
- 선행 근거:
${priorLines}

## 본문(맥락 — 재요약 금지, 인용만 최소)
${input.bodyText.slice(0, 2000)}

## 시사점 규칙 (분량 ${LENGTH.IMPLICATION_MIN}~${LENGTH.IMPLICATION_MAX}자 — 엄수)
시사점은 본문 재요약이 아니라 판단이다. 아래 4개 요소를 **각각 별도 문장(각 최소 70자)** 으로
반드시 모두 포함하라. 그러면 분량이 자연히 ${LENGTH.IMPLICATION_MIN}자를 넘는다:
  ① 조건부 전개: "만약 <운동유형/등급이 함의하는 조건>이 지속·확대되면 <결과>" 형태.
  ② 우리(경영진)가 무엇을 결정·조정해야 하는지 구체적 지목.
  ③ 이 판단이 틀릴 수 있는 지점(반증 시나리오)을 구체적으로.
  ④ ③이 현실화되면 우리가 어떻게 대응·유보할지.
- 4문장 합계 ${LENGTH.IMPLICATION_MIN}~${LENGTH.IMPLICATION_MAX}자. ${LENGTH.IMPLICATION_MAX}자 초과 금지.
- 금지 어미로 끝내지 마라: ${IMPLICATION_FORBIDDEN_ENDINGS.join(', ')}.
${isC ? '- 등급 C: 단정하지 마라. 무엇을 더 관측해야 판단이 서는지를 써라.' : ''}

## 킬 트리거 규칙
- "만약 <관측 가능한 사건>이 <시점(날짜)>까지 발생하면 이 판단을 철회한다" 형식.
- 관측 주체와 확인 경로를 명시하라. 반증 불가능한 조건 금지.

## 다음 주 확인 포인트
- 검증 이벤트와 예정 날짜(가능한 한 구체적).
${input.regenFeedback ? `\n## 재생성 피드백(직전 DoD 미달 — 반드시 교정)\n${input.regenFeedback}\n` : ''}
JSON만 출력.`;
}

/** 기본 구현: Gemini(비-grounded) + responseSchema. 호출경로/에러핸들링 재사용. */
export class GeminiJudgmentProvider implements JudgmentProvider {
    readonly name = 'gemini';
    private genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    private model = process.env.WEEKLY_JUDGMENT_MODEL || PRO_MODEL;

    async generate(input: JudgmentInput): Promise<Judgment> {
        const model = this.genAI.getGenerativeModel({ model: this.model });
        const result = await generateWithRetry(model, {
            contents: [{ role: 'user', parts: [{ text: buildJudgmentPrompt(input) }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema: JUDGMENT_SCHEMA as never },
        });
        const parsed = JSON.parse((await result.response).text());
        return {
            implications: String(parsed.implications ?? ''),
            killTrigger: String(parsed.killTrigger ?? ''),
            nextWeekCheck: String(parsed.nextWeekCheck ?? ''),
        };
    }
}

/** 설정 기반 provider 선택 단일 지점(향후 Claude 등 추가 시 여기만 수정). */
export function getJudgmentProvider(): JudgmentProvider {
    // WEEKLY_JUDGMENT_PROVIDER=gemini(기본). 다른 값은 미구현 — 명시적으로 gemini fallback.
    return new GeminiJudgmentProvider();
}
