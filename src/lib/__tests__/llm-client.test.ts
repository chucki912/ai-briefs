/** OpenRouter 어댑터 단위 테스트 (fetch mock, 외부 API 불필요). npx tsx src/lib/__tests__/llm-client.test.ts */
import { OpenRouterGenAI } from '../llm-client';
import { validateTriangulation } from '../validate-triangulation';
import { TRIANGULATION_CONFIG } from '../validation-config';

let pass = 0, fail = 0;
const chk = (name: string, cond: boolean, d?: string) => { if (cond) { pass++; console.log(`[PASS] ${name}`); } else { fail++; console.log(`[FAIL] ${name}${d ? ' — ' + d : ''}`); } };

// fetch mock: 마지막 요청 body를 기록하고 지정 응답을 돌려준다
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 임의 요청 body 검사용
let lastBody: any;
const mockFetch = (status: number, payload: unknown) => {
    globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
        lastBody = JSON.parse(init?.body ?? '{}');
        return new Response(JSON.stringify(payload), { status });
    }) as typeof fetch;
};
const ok = (message: Record<string, unknown>, usage: Record<string, unknown> = {}) =>
    ({ choices: [{ message: { role: 'assistant', ...message }, finish_reason: 'stop' }], usage });

const genAI = new OpenRouterGenAI('test-key');

(async () => {
    // 1. systemInstruction → system 메시지, 문자열 프롬프트 → user 메시지, 검색 도구 없음
    {
        mockFetch(200, ok({ content: 'hello' }));
        const model = genAI.getGenerativeModel({ model: 'deepseek/deepseek-v4.1-flash', systemInstruction: 'SYS' });
        const r = await model.generateContent('PROMPT');
        chk('system/user 메시지 매핑', lastBody.messages[0].role === 'system' && lastBody.messages[0].content === 'SYS' && lastBody.messages[1].content === 'PROMPT', JSON.stringify(lastBody.messages));
        chk('검색 미요청 → tools 없음, groundingMetadata 부재', lastBody.tools === undefined && r.response.candidates[0].groundingMetadata === undefined);
        chk('text() 반환', r.response.text() === 'hello');
    }

    // 2. contents + responseSchema → json_schema, 코드펜스 제거
    {
        mockFetch(200, ok({ content: '```json\n{"a":1}\n```' }));
        const schema = { type: 'object', properties: { a: { type: 'integer' } }, required: ['a'] };
        const model = genAI.getGenerativeModel({ model: 'm' });
        const r = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: 'IN' }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
        });
        chk('responseSchema → response_format json_schema', lastBody.response_format?.type === 'json_schema' && JSON.stringify(lastBody.response_format.json_schema?.schema) === JSON.stringify(schema), JSON.stringify(lastBody.response_format));
        chk('contents 텍스트 → user 메시지', lastBody.messages[0].content === 'IN');
        chk('JSON 모드 코드펜스 제거', JSON.parse(r.response.text()).a === 1, r.response.text());
    }

    // 3. googleSearch → openrouter:web_search, url_citation → groundingChunks(title=호스트명) → 삼각검증 통과
    {
        const urls = ['https://www.reuters.com/a', 'https://ft.com/b', 'https://news.example.co.kr/c', 'https://ft.com/b'];
        mockFetch(200, ok(
            { content: 'body', annotations: urls.map(url => ({ type: 'url_citation', url_citation: { url, title: 'Article' } })) },
            { server_tool_use: { web_search_requests: 2 } },
        ));
        const model = genAI.getGenerativeModel({ model: 'm', tools: [{ googleSearch: {} }] });
        const r = await model.generateContent('Q');
        const gm = r.response.candidates[0].groundingMetadata;
        chk('googleSearch → openrouter:web_search 도구', lastBody.tools?.[0]?.type === 'openrouter:web_search', JSON.stringify(lastBody.tools));
        chk('url_citation 중복 제거 + title=호스트명', gm?.groundingChunks.length === 3 && gm.groundingChunks[0].web.title === 'reuters.com' && gm.groundingChunks[0].web.url === urls[0], JSON.stringify(gm));
        const t = validateTriangulation(gm, ['https://www.bloomberg.com/x'], TRIANGULATION_CONFIG);
        chk('어댑터 출력이 삼각검증 게이트에서 도메인 해석됨', t.unresolvedChunks === 0 && t.independentDomainCount === 3, JSON.stringify(t));
    }

    // 4. 검색 수행했으나 인용 0 → 빈 청크(Gemini 'zero' 상태와 동일 의미)
    {
        mockFetch(200, ok({ content: 'body' }, { server_tool_use: { web_search_requests: 1 } }));
        const r = await genAI.getGenerativeModel({ model: 'm', tools: [{ googleSearch: {} }] }).generateContent('Q');
        chk('검색 수행·인용 0 → groundingChunks []', r.response.candidates[0].groundingMetadata?.groundingChunks.length === 0);
    }

    // 5. 오류 status 정규화: 429 유지, 502/본문 내 오류 → 503 (기존 재시도 판정 호환)
    {
        const statusOf = async () => {
            try { await genAI.getGenerativeModel({ model: 'm' }).generateContent('Q'); return -1; }
            catch (e) { return (e as { status?: number }).status; }
        };
        mockFetch(429, { error: { code: 429, message: 'rate limited' } });
        chk('429 → status 429', (await statusOf()) === 429);
        mockFetch(502, { error: { code: 502, message: 'provider down' } });
        chk('502 → status 503', (await statusOf()) === 503);
        mockFetch(200, { choices: [{ error: { code: 500, message: 'upstream' } }] });
        chk('200 본문 내 오류 → status 503', (await statusOf()) === 503);
    }

    // 6. 키 미설정 → 즉시 401 오류(네트워크 호출 없음)
    {
        try { await new OpenRouterGenAI('').getGenerativeModel({ model: 'm' }).generateContent('Q'); chk('키 미설정 → 오류', false); }
        catch (e) { chk('키 미설정 → 오류(401)', (e as { status?: number }).status === 401); }
    }

    console.log(`\nLLM 어댑터 테스트: ${pass} passed, ${fail} failed`);
    if (fail > 0) process.exit(1);
})();
