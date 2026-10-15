/**
 * OpenRouter LLM 클라이언트 — @google/generative-ai 호출면 호환 어댑터
 *
 * 호출부는 기존 Gemini SDK 사용 형태(getGenerativeModel → generateContent → response.text())를
 * 그대로 유지하고, 전송만 OpenRouter Chat Completions로 바꾼다.
 *
 * 매핑:
 * - systemInstruction                → system 메시지
 * - tools: [{ googleSearch: {} }]    → openrouter:web_search 서버 도구 (DeepSeek는 Exa 엔진)
 * - responseSchema                   → response_format json_schema (스키마는 이미 JSON Schema 소문자 형식)
 * - message.annotations(url_citation) → candidates[0].groundingMetadata.groundingChunks
 *   (web.title = 호스트명 — validate-triangulation이 title을 도메인으로 해석하는 계약 유지)
 * - HTTP 오류                        → error.status (429 그대로, 5xx/408은 503으로 정규화 — 기존 재시도 판정 호환)
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * 폭주 생성·무응답 방어: 출력 상한(추론 토큰 포함) + 요청 타임아웃.
 * 실측(2026-10-15) 이슈 생성 1회 4~11k 토큰·17~67s — 상한은 최대 실측의 약 3배.
 */
const DEFAULT_MAX_TOKENS = 32768;
const REQUEST_TIMEOUT_MS = 240_000;

/** 검색 1회당 결과 수 / 요청당 총 결과 상한 (Exa: 10건까지 요청가 포함, 초과분 건당 과금) */
const WEB_SEARCH_MAX_RESULTS = 8;
const WEB_SEARCH_MAX_TOTAL_RESULTS = 30;

type Part = { text?: string };
type Content = { role?: string; parts: Part[] };

export interface GenerationConfig {
    responseMimeType?: string;
    responseSchema?: unknown;
    temperature?: number;
    maxOutputTokens?: number;
}

export interface ModelParams {
    model: string;
    systemInstruction?: string;
    tools?: unknown[];
    generationConfig?: GenerationConfig;
}

export type GenerateContentRequest = string | { contents: Content[]; generationConfig?: GenerationConfig };

export interface GroundingChunk { web: { uri: string; url: string; title: string } }
export interface GroundingMetadata { groundingChunks: GroundingChunk[] }

export interface GenerateContentResult {
    response: {
        text(): string;
        candidates: Array<{ finishReason?: string; groundingMetadata?: GroundingMetadata }>;
    };
}

interface ApiError { code?: number | string; message?: string }
interface ChatCompletionResponse {
    error?: ApiError;
    choices?: Array<{
        error?: ApiError;
        finish_reason?: string;
        message?: { content?: string | null; annotations?: unknown };
    }>;
    usage?: { server_tool_use?: { web_search_requests?: number } };
}

export class LlmError extends Error {
    constructor(message: string, public status?: number) {
        super(message);
        this.name = 'LlmError';
    }
}

// 기존 재시도 로직(503/429 판정)과 호환되도록 일시적 서버 오류를 503으로 수렴
function normalizeStatus(status: number): number {
    return status >= 500 || status === 408 ? 503 : status;
}

function hasGoogleSearch(tools: unknown[] | undefined): boolean {
    return !!tools?.some(t => typeof t === 'object' && t !== null && 'googleSearch' in t);
}

function stripJsonFence(text: string): string {
    const m = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    return m ? m[1] : text;
}

function hostnameOf(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}

function toGroundingMetadata(annotations: unknown): GroundingMetadata {
    const chunks: GroundingChunk[] = [];
    const seen = new Set<string>();
    for (const a of Array.isArray(annotations) ? annotations : []) {
        const url = (a as { type?: string; url_citation?: { url?: string } })?.type === 'url_citation'
            ? (a as { url_citation?: { url?: string } }).url_citation?.url
            : undefined;
        if (!url || seen.has(url)) continue;
        seen.add(url);
        chunks.push({ web: { uri: url, url, title: hostnameOf(url) } });
    }
    return { groundingChunks: chunks };
}

export class GenerativeModel {
    constructor(private apiKey: string, private params: ModelParams) {}

    async generateContent(request: GenerateContentRequest): Promise<GenerateContentResult> {
        const { model, systemInstruction, tools } = this.params;
        const userText = typeof request === 'string'
            ? request
            : request.contents.flatMap(c => c.parts.map(p => p.text ?? '')).join('\n');
        const config: GenerationConfig = {
            ...this.params.generationConfig,
            ...(typeof request === 'string' ? {} : request.generationConfig),
        };
        const webSearch = hasGoogleSearch(tools);

        const body: Record<string, unknown> = {
            model,
            messages: [
                ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
                { role: 'user', content: userText },
            ],
        };
        if (webSearch) {
            body.tools = [{
                type: 'openrouter:web_search',
                parameters: { engine: 'exa', max_results: WEB_SEARCH_MAX_RESULTS, max_total_results: WEB_SEARCH_MAX_TOTAL_RESULTS },
            }];
        }
        if (config.responseSchema) {
            body.response_format = { type: 'json_schema', json_schema: { name: 'response', schema: config.responseSchema } };
        } else if (config.responseMimeType === 'application/json') {
            body.response_format = { type: 'json_object' };
        }
        if (config.temperature !== undefined) body.temperature = config.temperature;
        body.max_tokens = config.maxOutputTokens ?? DEFAULT_MAX_TOKENS;

        if (!this.apiKey) throw new LlmError('OPENROUTER_API_KEY 가 설정되지 않았습니다.', 401);

        // 전송 실패·타임아웃도 LlmError(503)로 — 호출부가 'API 실패'와 '내용 불합격'을 구분할 수 있도록
        let res: Response;
        let raw: string;
        try {
            res = await fetch(OPENROUTER_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'X-Title': 'ai-daily-brief',
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            raw = await res.text();
        } catch (e) {
            const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
            throw new LlmError(timedOut
                ? `OpenRouter 응답 시간 초과 (${REQUEST_TIMEOUT_MS}ms) [${model}]`
                : `OpenRouter 전송 실패 [${model}]: ${e instanceof Error ? e.message : e}`, 503);
        }
        let data: ChatCompletionResponse;
        try {
            data = JSON.parse(raw);
        } catch {
            throw new LlmError(`OpenRouter 응답 파싱 실패 (HTTP ${res.status}): ${raw.slice(0, 200)}`, normalizeStatus(res.status >= 400 ? res.status : 502));
        }
        // HTTP 오류 + 200 본문 내 오류(업스트림 프로바이더 실패) 모두 처리
        const err = data?.error ?? data?.choices?.[0]?.error;
        if (!res.ok || err) {
            const code = Number(err?.code) || res.status;
            throw new LlmError(`OpenRouter 오류 (${code}) [${model}]: ${err?.message ?? raw.slice(0, 200)}`, normalizeStatus(code));
        }

        const choice = data?.choices?.[0];
        const content: string = typeof choice?.message?.content === 'string' ? choice.message.content : '';
        const isJson = !!config.responseSchema || config.responseMimeType === 'application/json';
        // Gemini와 동일 의미: 검색 미수행 = groundingMetadata 부재, 수행했으나 인용 0 = 빈 청크
        const searched = webSearch && ((data?.usage?.server_tool_use?.web_search_requests ?? 0) > 0
            || Array.isArray(choice?.message?.annotations));
        return {
            response: {
                text: () => (isJson ? stripJsonFence(content) : content),
                candidates: [{
                    finishReason: choice?.finish_reason,
                    groundingMetadata: searched ? toGroundingMetadata(choice?.message?.annotations) : undefined,
                }],
            },
        };
    }
}

export class OpenRouterGenAI {
    constructor(private apiKey: string) {}

    getGenerativeModel(params: ModelParams): GenerativeModel {
        return new GenerativeModel(this.apiKey, params);
    }
}
