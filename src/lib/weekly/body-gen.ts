/**
 * PASS 4 — 승격 스레드 본문 생성 (PRO + googleSearch) (T5)
 *
 * PASS 2/3이 계산한 사실값(observedDates, priorWeeksInternal, 등급, priorEvidence,
 * motionTypes)을 확정값으로 주입한다. 모델이 재계산·반박하지 못하게 한다.
 * 본문은 [배경]/[주요 내용]만 작성(=[시사점]은 PASS 5 전담). 하우스 스타일 준수.
 *
 * motionType 확정: 본문에서 실제 근거를 제시한 유형만 <<MOTION>> 라인으로 회신.
 * 미제시 유형은 오케스트레이터가 제거 후 등급을 재계산(하향 가능).
 *
 * 2-pass 원칙: 이 패스는 googleSearch만(responseSchema 미사용). 구조화는 PASS 6.
 */
import { PRO_MODEL } from '../gemini-models';
import { generateWithRetry } from '../deep-dive-pipeline';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { LENGTH, STRUCTURE, PARAGRAPH_MIX } from '@/configs/weekly-house-style';
import type { MotionTypeCode, Grade, PriorEvidence } from './grade';
import type { GradedThread } from './pipeline';
import type { NormalizedItem } from './types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const MODEL = process.env.WEEKLY_BODY_MODEL || PRO_MODEL;

export interface BodyDraft {
    threadKey: string;
    label: string;
    draftText: string;               // [배경]+[주요 내용] (<<MOTION>> 라인 제거됨)
    confirmedMotionTypes: MotionTypeCode[];
}

const MOTION_RE = /<<MOTION>>\s*([A-Z0-9,\s]*)/;

/** 본문 초안에서 <<MOTION>> 확정 라인 파싱 후 본문에서 제거. 순수 함수. */
export function parseBodyDraft(
    rawText: string,
    candidateMotions: MotionTypeCode[],
): { draftText: string; confirmedMotionTypes: MotionTypeCode[] } {
    const m = MOTION_RE.exec(rawText);
    const candidateSet = new Set(candidateMotions);
    let confirmed: MotionTypeCode[] = [];
    if (m) {
        confirmed = m[1].split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
            .filter((x): x is MotionTypeCode => candidateSet.has(x as MotionTypeCode));
    }
    // 확정 라인이 없으면 후보를 보수적으로 그대로 인정하지 않고 빈 배열(하향 유도) — 단,
    // 파싱 실패 방어: 라인이 아예 없으면 후보 유지(모델이 라인을 빠뜨린 경우 과도 하향 방지)
    if (!m) confirmed = candidateMotions;
    const draftText = rawText.replace(MOTION_RE, '').trim();
    return { draftText, confirmedMotionTypes: Array.from(new Set(confirmed)) };
}

export function buildBodyPrompt(input: {
    label: string;
    grade: Grade;
    observedDates: string[];
    priorWeeksInternal: number;
    motionTypes: MotionTypeCode[];
    priorEvidence: PriorEvidence[];
    items: NormalizedItem[];
    regenFeedback?: string;
}): string {
    const facts = input.items.flatMap(it => it.keyFacts).slice(0, 20).map(f => `- ${f}`).join('\n');
    const sources = Array.from(new Set(input.items.flatMap(it => it.sourceUrls))).slice(0, 15).join('\n');
    const priorLines = input.priorEvidence.map(e =>
        `- [${e.source}] ${e.observedAt}${e.quote ? ` "${e.quote}"` : ''}${e.mechanismNote ? ` (${e.mechanismNote})` : ''}`,
    ).join('\n') || '(선행 관측 없음)';

    return `당신은 LG경영연구원의 주간 산업 인텔리전스 애널리스트다. 독자는 CEO·경영진이다.
아래 스레드의 본문을 하우스 스타일로 작성하라. **[배경]과 [주요 내용]만** 쓴다. [시사점]은 쓰지 마라(별도 단계).

## 확정값(코드가 계산 — 재계산·반박 금지, 그대로 인용)
- 등급: ${input.grade}
- 관측 일자: ${input.observedDates.join(', ')} (총 ${input.observedDates.length}일)
- 내부 선행 관측 주차 수(priorWeeksInternal): ${input.priorWeeksInternal}
- 운동유형 후보: ${input.motionTypes.join(', ') || '없음'}

## 선행 근거
${priorLines}

## 이번 주 사실(원사실만)
${facts}

## 소스 URL
${sources}

## 작성 규격(하우스 스타일 — 엄수)
- 라벨: ${STRUCTURE.LABELS.slice(0, 2).join(' , ')} 두 단만(대괄호 그대로).
  [배경]: 과거 시그널 위치·상태(M1/priorWeeksInternal 근거). ${LENGTH.IMPLICATION_MIN}자 이하로 간결.
    선행 근거 없으면 "선행 관측 없음"이라 명시(빈칸 금지).
  [주요 내용]: 이번 주 관측 사실 + 정량 근거. 두 단 합계 ${LENGTH.BODY_MIN}~${LENGTH.BODY_MAX}자
    (**목표 약 1350자** — 시사점 비율 확보를 위해 하한이 아니라 상한 근처를 노려라).
- 서로 다른 수치 ${STRUCTURE.MIN_DISTINCT_METRICS}개 이상 사용.
- 시점(전주/전월/전년) 또는 대상 간 **비교 표 1개 이상**(마크다운). 단순 나열 표 금지.
- 헤더 ${STRUCTURE.HEADER_MIN}~${STRUCTURE.HEADER_MAX}개, 최대 깊이 ${STRUCTURE.MAX_DEPTH}.
- 단순 사건 나열 단락은 전체의 ${Math.round(PARAGRAPH_MIX.B9_PLAIN_MAX * 100)}% 이하. 비교·해석 위주로.
- 출처 미확인 수치는 쓰지 마라. 근사치로 대체하지 마라.
${input.observedDates.length === 1 ? '- ⚠️ 단일일 관측: "트렌드/흐름/추세/본격화/가속화/전환점/패러다임" 사용 금지.' : ''}

## 운동유형 확정(중요)
본문에서 **실제 근거를 제시한** 운동유형만 마지막 줄에 회신하라:
<<MOTION>>M1,M2   (근거 제시한 것만. 없으면 <<MOTION>>)
- M2(가속)는 서로 다른 두 시점의 수치 2개와 변화를 본문에 실제로 제시한 경우에만.
- M4(확산)는 서로 다른 산업/기업군 사례 2건을 본문에 제시한 경우에만.

${input.regenFeedback ? `\n## 재생성 피드백(직전 초안 DoD 미달 — 반드시 교정)\n${input.regenFeedback}\n` : ''}
본문(마크다운) 작성 후 마지막 줄에 <<MOTION>> 라인을 넣어라.`;
}

/** PASS 4 실행. grounded 초안 생성 후 <<MOTION>> 확정 파싱. regenFeedback 있으면 교정 지시. */
export async function generateBody(thread: GradedThread, items: NormalizedItem[], regenFeedback?: string): Promise<BodyDraft> {
    const model = genAI.getGenerativeModel({ model: MODEL, tools: [{ googleSearch: {} } as never] });
    const prompt = buildBodyPrompt({
        label: thread.label, grade: thread.grade, observedDates: thread.gate.observedDates,
        priorWeeksInternal: thread.gate.priorWeeksInternal, motionTypes: thread.motionTypes,
        priorEvidence: thread.priorEvidence, items, regenFeedback,
    });
    const result = await generateWithRetry(model, prompt);
    const text = (await result.response).text();
    const { draftText, confirmedMotionTypes } = parseBodyDraft(text, thread.motionTypes);
    return { threadKey: thread.threadKey, label: thread.label, draftText, confirmedMotionTypes };
}
