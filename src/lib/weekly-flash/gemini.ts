/**
 * 주간 AI 단신 생성기 — Gemini + Google Search grounding 호출 (서버 전용)
 *
 * 사양은 Anthropic web_search 를 전제했으나, 본 프로젝트는 기존 스택과 동일하게
 * Gemini grounding 으로 실시간 웹 검색을 수행한다(battery-gemini.ts 와 동일 패턴).
 * API 키(GEMINI_API_KEY)는 서버에서만 사용되며 클라이언트 번들에 포함되지 않는다.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { WEEKLY_FLASH_SYSTEM_PROMPT } from './prompt';
import { parseFlashMemo } from './parse';
import { FlashMemo, GroundingSource } from './types';
import { PRO_MODEL } from '../gemini-models';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/** 모델은 env 로 분리. 기본값은 grounding 품질이 높은 Pro 모델. */
const MODEL = process.env.WEEKLY_FLASH_MODEL || PRO_MODEL;

const TIMEOUT_MS = 110_000;
const MAX_ATTEMPTS = 3; // 최초 1회 + 재시도 2회 (사양: 재시도 최대 2회)

export interface GenerateFlashOptions {
  /** 오늘로 간주할 기준일 (YYYY-MM-DD, KST) */
  baseDate: string;
  /** 검색 윈도우 (7 | 14) */
  windowDays: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Gemini 응답 시간 초과 (${ms}ms)`)),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function generateWithRetry(
  model: ReturnType<typeof genAI.getGenerativeModel>,
  prompt: string,
): Promise<Awaited<ReturnType<typeof model.generateContent>>> {
  let lastError: unknown;
  let delay = 2000;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await withTimeout(model.generateContent(prompt), TIMEOUT_MS);
    } catch (error: unknown) {
      lastError = error;
      const err = error as { status?: number; message?: string };
      const retriable =
        err.status === 503 ||
        err.status === 429 ||
        /overloaded|RESOURCE_EXHAUSTED|시간 초과|timeout/i.test(
          err.message || '',
        );
      if (retriable && attempt < MAX_ATTEMPTS) {
        console.warn(
          `[WeeklyFlash] 시도 ${attempt} 실패. ${delay}ms 후 재시도...`,
        );
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error('Gemini 생성 실패');
}

export async function generateWeeklyFlash(
  opts: GenerateFlashOptions,
): Promise<FlashMemo> {
  const { baseDate, windowDays } = opts;

  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: WEEKLY_FLASH_SYSTEM_PROMPT,
    tools: [{ googleSearch: {} } as never],
  });

  const userPrompt = `[작업 지시]
- 오늘(기준일): ${baseDate} — 이 날짜를 "오늘"로 간주한다. (KST, 서버에서 확인한 실제 날짜)
- 최근성 범위: 기준일로부터 D-${windowDays} ~ 기준일에 공개된 뉴스만 본문에 포함.${
    windowDays > 7
      ? '\n- D-7을 넘어 D-14까지 확장한 항목에는 반드시 [기준 외 확장] 으로 표기한다.'
      : ''
  }
- 위 시스템 프롬프트의 모든 절차·선별·검증 규칙을 준수하여 한국어 단신 메모만 출력한다.
- 출력 첫 줄의 "날짜:" 에는 위 기준일(${baseDate})을 그대로 사용한다.`;

  const result = await generateWithRetry(model, userPrompt);
  const response = result.response;
  const text = response.text();

  // grounding 출처 수집 (앱이 보정하지 않은 원본 — 검증 보조용)
  const groundingSources: GroundingSource[] = [];
  const seen = new Set<string>();
  const meta = response.candidates?.[0]?.groundingMetadata as
    | { groundingChunks?: Array<{ web?: { uri?: string; url?: string; title?: string } }> }
    | undefined;
  if (meta?.groundingChunks) {
    for (const chunk of meta.groundingChunks) {
      const url = chunk.web?.url || chunk.web?.uri;
      if (url && !seen.has(url)) {
        seen.add(url);
        groundingSources.push({ url, title: chunk.web?.title || url });
      }
    }
  }

  const parsed = parseFlashMemo(text);

  return {
    ...parsed,
    // 모델이 날짜를 비웠다면 기준일로 보정 (링크/사실은 보정하지 않음)
    date: parsed.date || baseDate,
    rawText: text.trim(),
    groundingSources,
    windowDays,
    baseDate,
    reportType: 'weekly_flash',
  };
}
