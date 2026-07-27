/**
 * PASS 6 — 구조화 (FLASH + responseSchema) (T5)
 *
 * PASS 4 본문 초안을 구조화 JSON으로 추출한다. 2패스 원칙: googleSearch 미사용
 * (PRO+googleSearch와 responseSchema 동시 사용 금지). 창작 금지 — 초안에 있는 것만 추출.
 * threadKey/label/grade/판단(시사점·킬트리거)은 코드가 stamp(모델 추출 금지).
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FLASH_MODEL } from '../gemini-models';
import { generateWithRetry } from '../deep-dive-pipeline';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const MODEL = process.env.WEEKLY_STRUCTURE_MODEL || FLASH_MODEL;

export interface WeeklyTable {
    title: string;
    headers: string[];
    rows: string[][];        // 시점/대상 비교
}

/** PASS 6이 초안에서 추출하는 부분(판단 필드는 코드 stamp). */
export interface StructuredBody {
    background: string;      // [배경]
    mainContent: string;     // [주요 내용]
    table: WeeklyTable;
    metricsUsed: string[];   // 본문에 등장한 서로 다른 수치
}

const STRUCTURE_SCHEMA = {
    type: 'object',
    properties: {
        background: { type: 'string', description: '[배경] 단락 원문' },
        mainContent: { type: 'string', description: '[주요 내용] 단락 원문' },
        table: {
            type: 'object',
            properties: {
                title: { type: 'string' },
                headers: { type: 'array', items: { type: 'string' } },
                rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
            },
            required: ['title', 'headers', 'rows'],
        },
        metricsUsed: { type: 'array', items: { type: 'string' }, description: '본문에 실제 등장한 서로 다른 수치' },
    },
    required: ['background', 'mainContent', 'table', 'metricsUsed'],
} as const;

const STRUCTURE_SYSTEM_PROMPT = `당신은 추출기다. 주어진 주간 리포트 본문 초안에서 구조화 필드만 추출한다.
창작 금지 — 초안에 없는 내용을 만들지 마라. [배경]/[주요 내용] 라벨 아래 텍스트를 각각 background/
mainContent로 옮기고, 초안의 비교 표를 table로, 등장한 서로 다른 수치를 metricsUsed로 추출한다.
표가 여러 개면 가장 비교 구조가 뚜렷한 하나를 고른다. JSON만 출력.`;

/** PASS 6 실행. 파싱 실패 시 1회 재시도, 최종 실패 시 null. */
export async function structureBody(draftText: string): Promise<StructuredBody | null> {
    const model = genAI.getGenerativeModel({ model: MODEL, systemInstruction: STRUCTURE_SYSTEM_PROMPT });
    const input = `# 본문 초안\n${draftText}`;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const result = await generateWithRetry(model, {
                contents: [{ role: 'user', parts: [{ text: input }] }],
                generationConfig: { responseMimeType: 'application/json', responseSchema: STRUCTURE_SCHEMA as never },
            });
            const parsed = JSON.parse((await result.response).text());
            return {
                background: String(parsed.background ?? ''),
                mainContent: String(parsed.mainContent ?? ''),
                table: {
                    title: String(parsed.table?.title ?? ''),
                    headers: Array.isArray(parsed.table?.headers) ? parsed.table.headers.map(String) : [],
                    rows: Array.isArray(parsed.table?.rows) ? parsed.table.rows.map((r: unknown[]) => (Array.isArray(r) ? r.map(String) : [])) : [],
                },
                metricsUsed: Array.isArray(parsed.metricsUsed) ? parsed.metricsUsed.map(String) : [],
            };
        } catch (e) {
            console.warn(`[WeeklyStructure] pass 6 시도 ${attempt}/2 실패: ${e instanceof Error ? e.message : e}`);
        }
    }
    return null;
}
