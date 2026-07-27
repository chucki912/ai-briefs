/**
 * PASS 2.5 — 과거 근거 웹 보강 (조건부 실행) (T4)
 *
 * priorWeeksInternal == 0 스레드에만 실행한다(전량 검색은 비용 낭비·등급 인플레이션).
 * Gemini googleSearch grounding으로 "이번 주 이전의 동일 인과 메커니즘" 근거를 찾는다.
 *
 * 인정 요건(전부 충족, 하나라도 불충족 시 reject):
 *   · 동일 인과 메커니즘(같은 키워드만으로는 불인정) — mechanismNote로 명시
 *   · 근거 문장 원문 인용(quote) 존재
 *   · 발행일(observedAt) 확인 가능 AND asOf(이번 주) 이전
 * 저장: priorEvidence = {source:'web', observedAt, url, quote, mechanismNote}.
 * internal 근거와 절대 섞어서 카운트하지 않는다(별도 source 태깅).
 *
 * 순수 파트(prompt/parse/validate)는 API 없이 테스트 가능하도록 분리.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PRO_MODEL } from '../gemini-models';
import type { PriorEvidence } from './grade';
import type { WebBoostContext, WebBoostFn } from './pipeline';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const MODEL = process.env.WEEKLY_PRIOR_BOOST_MODEL || PRO_MODEL;
const TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 3;
const MAX_EVIDENCE = 3;               // 스레드당 웹 근거 상한
const KEYFACTS_FOR_QUERY = 4;

/** YYYY-MM 또는 YYYY-MM-DD 를 Date로. 파싱 불가 시 null. */
export function parseObservedAt(raw: unknown): { iso: string; date: Date } | null {
    if (typeof raw !== 'string') return null;
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(raw.trim());
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), d = m[3] ? Number(m[3]) : 1;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { iso: m[3] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[1]}-${m[2]}`, date: new Date(y, mo - 1, d) };
}

interface RawWebEvidence { url?: unknown; quote?: unknown; observedAt?: unknown; mechanismNote?: unknown }

/**
 * 원시 웹 근거 후보를 검증·정규화. 인정 요건 미충족 시 null.
 * asOf 이전 발행만 인정(이번 주/미래 자료는 '선행 근거'가 아니므로 배제).
 */
export function validateWebEvidence(raw: RawWebEvidence, asOf: string | Date): PriorEvidence | null {
    const url = typeof raw.url === 'string' ? raw.url.trim() : '';
    const quote = typeof raw.quote === 'string' ? raw.quote.trim() : '';
    const mechanismNote = typeof raw.mechanismNote === 'string' ? raw.mechanismNote.trim() : '';
    if (!url || !/^https?:\/\//.test(url)) return null;   // 확인 가능한 URL 필수
    if (quote.length < 8) return null;                    // 원문 인용 필수
    if (!mechanismNote) return null;                      // 메커니즘 일치 근거 필수

    const parsed = parseObservedAt(raw.observedAt);
    if (!parsed) return null;                             // 발행일 확인 필수

    const asOfDate = asOf instanceof Date ? asOf : new Date(`${String(asOf).slice(0, 10)}T00:00:00`);
    if (!(parsed.date < asOfDate)) return null;           // asOf 이전(선행)만 인정

    return { source: 'web', observedAt: parsed.iso, url, quote, mechanismNote };
}

/** grounded 응답 텍스트에서 근거 배열 파싱. {evidence:[...]} 또는 [...] 허용. */
export function parsePriorBoostResponse(text: string): RawWebEvidence[] {
    const objMatch = text.match(/\{[\s\S]*\}/);
    const arrMatch = text.match(/\[[\s\S]*\]/);
    try {
        if (objMatch) {
            const parsed = JSON.parse(objMatch[0]);
            if (Array.isArray(parsed?.evidence)) return parsed.evidence;
        }
    } catch { /* fallthrough */ }
    try {
        if (arrMatch) {
            const parsed = JSON.parse(arrMatch[0]);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch { /* fallthrough */ }
    return [];
}

export function buildPriorBoostPrompt(label: string, keyFacts: string[], asOf: string | Date): string {
    const asOfStr = (asOf instanceof Date ? asOf.toISOString() : String(asOf)).slice(0, 10);
    const facts = keyFacts.slice(0, KEYFACTS_FOR_QUERY).map(f => `- ${f}`).join('\n');
    return `다음 이슈의 **인과 메커니즘**이 ${asOfStr} 이전에도 관측됐는지 웹에서 확인하라.

## 이슈
제목: ${label}
이번 주 사실:
${facts || '(요약 없음)'}

## 과제
${asOfStr} **이전**에 발행된 자료 중, 위 이슈와 **동일한 인과 메커니즘**(단순 동일 키워드가
아니라 같은 원인→결과 구조)을 다룬 근거를 최대 ${MAX_EVIDENCE}건 찾아라.

## 엄격한 인정 요건(하나라도 불충족이면 그 근거는 제외)
1. 발행일이 ${asOfStr} 이전이고 확인 가능해야 한다(YYYY-MM 또는 YYYY-MM-DD).
2. 원문에서 근거 문장을 그대로 인용(quote)해야 한다.
3. 동일 인과 메커니즘임을 mechanismNote에 한 문장으로 설명해야 한다.
   같은 기업·키워드일 뿐 메커니즘이 다르면 제외한다.
근거가 없으면 빈 배열을 반환하라. 억지로 채우지 마라.

## 출력(JSON만)
{"evidence":[{"url":"https://...","observedAt":"2026-05","quote":"원문 인용","mechanismNote":"메커니즘 일치 근거"}]}`;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`prior-boost 시간 초과(${ms}ms)`)), ms);
        p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });
}

const NETWORK_ERR = /fetch failed|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|socket hang up|overloaded|RESOURCE_EXHAUSTED|시간 초과|timeout/i;

/** 한 스레드에 대한 웹 선행 근거 조회. 실패해도 throw하지 않고 빈 배열(보강은 선택적). */
export async function fetchWebPriorEvidence(ctx: WebBoostContext): Promise<PriorEvidence[]> {
    const model = genAI.getGenerativeModel({ model: MODEL, tools: [{ googleSearch: {} } as never] });
    const prompt = buildPriorBoostPrompt(ctx.label, ctx.keyFacts, ctx.asOf);

    let delay = 2000;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const result = await withTimeout(model.generateContent(prompt), TIMEOUT_MS);
            const text = result.response.text();
            const raw = parsePriorBoostResponse(text);
            const valid = raw
                .map(r => validateWebEvidence(r, ctx.asOf))
                .filter((e): e is PriorEvidence => e !== null);
            // URL 기준 dedup + 상한
            const seen = new Set<string>();
            const out: PriorEvidence[] = [];
            for (const e of valid) { if (!seen.has(e.url!)) { seen.add(e.url!); out.push(e); } if (out.length >= MAX_EVIDENCE) break; }
            return out;
        } catch (err) {
            const msg = `${(err as { status?: number })?.status ?? ''} ${(err as Error)?.message ?? ''}`;
            if (NETWORK_ERR.test(msg) && attempt < MAX_ATTEMPTS) {
                await new Promise(r => setTimeout(r, delay)); delay *= 2; continue;
            }
            console.warn(`[PriorBoost] "${ctx.threadKey}" 웹 보강 실패(무시): ${(err as Error)?.message}`);
            return [];
        }
    }
    return [];
}

/** 파이프라인 webBoost 훅 생성. 기본 구현은 Gemini grounded 조회. */
export function makeWebBoost(): WebBoostFn {
    return (ctx) => fetchWebPriorEvidence(ctx);
}
