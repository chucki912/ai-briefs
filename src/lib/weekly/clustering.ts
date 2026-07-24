/**
 * PASS 1 — 스레드 클러스터링 (LLM) (T2)
 *
 * 클러스터링만 한다. 트렌드 여부·등급·중요도는 판단하지 않는다(설계 원칙).
 *   - 기준은 키워드가 아니라 동일 인과 메커니즘.
 *   - 같은 기업의 다른 사건은 메커니즘이 다르면 분리, 다른 기업의 같은 메커니즘은 통합.
 *   - 기존 threadIndex와 동일 메커니즘이면 반드시 기존 threadKey 재사용(M1 판정 근거).
 *   - 각 아이템에 폐쇄형 industryTag 부여(M4 근거). 자유 문자열은 reject 후 1회 재요청.
 *
 * 파싱/살균은 순수 함수(parseAndSanitize)로 분리해 API 없이 테스트 가능.
 */
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { FLASH_MODEL } from '../gemini-models';
import {
    INDUSTRY_TAGS, INDUSTRY_TAG_LABELS, validateIndustryTags,
} from '@/configs/industry-tags';
import type { NormalizedItem, ClusterAssignment, ClusterMember } from './types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface ThreadCandidate { threadKey: string; label: string; }

/** 임의 문자열 → 안전한 영문 스네이크케이스 threadKey. 실패 시 fallback. */
export function toSnakeKey(raw: string, fallbackIdx: number): string {
    const key = (raw || '').trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_{2,}/g, '_');
    return key.length >= 2 ? key : `thread_${fallbackIdx}`;
}

interface RawThread {
    threadKey?: string;
    label?: string;
    matchedExisting?: boolean;
    members?: { itemIndex?: number; industryTags?: unknown }[];
}

/**
 * 모델 응답 텍스트를 파싱·살균해 ClusterAssignment[] 로 변환. 순수 함수.
 *   - itemIndex 범위 검증 → itemId 매핑, 스레드 내 중복 아이템 제거
 *   - threadKey: 후보에 있으면 재사용(matchedExisting=true), 아니면 snake화
 *   - 동일 threadKey 스레드는 병합
 *   - industryTags 검증: valid만 유지, rejected 원문은 수집(재요청 트리거)
 */
export function parseAndSanitize(
    rawText: string,
    items: NormalizedItem[],
    candidateKeys: ReadonlySet<string>,
): { assignments: ClusterAssignment[]; rejectedTags: string[] } {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Clustering JSON not found');
    const parsed = JSON.parse(jsonMatch[0]) as { threads?: RawThread[] };
    const rawThreads = Array.isArray(parsed.threads) ? parsed.threads : [];

    const rejectedTags: string[] = [];
    const byKey = new Map<string, ClusterAssignment>();

    rawThreads.forEach((t, tIdx) => {
        const proposedKey = typeof t.threadKey === 'string' ? t.threadKey : '';
        const matched = candidateKeys.has(proposedKey);
        const threadKey = matched ? proposedKey : toSnakeKey(proposedKey || t.label || '', tIdx);
        const label = (typeof t.label === 'string' && t.label.trim()) ? t.label.trim() : threadKey;

        const members: ClusterMember[] = [];
        const seenItems = new Set<string>();
        for (const rawM of t.members ?? []) {
            const idx = rawM.itemIndex;
            if (typeof idx !== 'number' || idx < 0 || idx >= items.length) continue;
            const itemId = items[idx].itemId;
            if (seenItems.has(itemId)) continue;
            seenItems.add(itemId);
            const { valid, rejected } = validateIndustryTags(rawM.industryTags);
            rejectedTags.push(...rejected);
            members.push({ itemId, industryTags: valid });
        }
        if (members.length === 0) return;

        const existing = byKey.get(threadKey);
        if (existing) {
            // 동일 threadKey 병합(아이템 dedup)
            const seen = new Set(existing.members.map(m => m.itemId));
            for (const m of members) if (!seen.has(m.itemId)) { seen.add(m.itemId); existing.members.push(m); }
        } else {
            byKey.set(threadKey, {
                threadKey,
                label,
                matchedExisting: candidateKeys.has(threadKey),
                members,
            });
        }
    });

    return { assignments: Array.from(byKey.values()), rejectedTags: Array.from(new Set(rejectedTags)) };
}

function buildPrompt(
    items: NormalizedItem[],
    candidates: ThreadCandidate[],
    domain: 'ai' | 'battery',
    rejectedNote?: string[],
): string {
    const itemList = items.map((it, idx) =>
        `[${idx}] (${it.publishedAt}) ${it.title}\n    facts: ${it.keyFacts.slice(0, 2).join(' | ')}`,
    ).join('\n');

    const candidateList = candidates.length > 0
        ? candidates.map(c => `- ${c.threadKey} : ${c.label}`).join('\n')
        : '(없음 — 과거 스레드 없음)';

    const tagList = INDUSTRY_TAGS.map(t => `${t}(${INDUSTRY_TAG_LABELS[t]})`).join(', ');

    const domainNote = domain === 'ai' ? 'AI/테크' : '배터리/에너지';

    const rejectionBlock = rejectedNote && rejectedNote.length > 0
        ? `\n## 재요청\n직전 응답에서 사전에 없는 industryTag가 있었다: ${JSON.stringify(rejectedNote)}\n반드시 아래 허용 목록의 값만 사용하라. 매칭되는 값이 없으면 그 태그는 붙이지 마라.\n`
        : '';

    return `당신은 ${domainNote} 산업 이슈를 "동일 인과 메커니즘" 기준으로 묶는 분류기다.
트렌드 여부·등급·중요도는 판단하지 마라. 오직 클러스터링과 산업 태그 부여만 한다.
${rejectionBlock}
## 규칙
1. 키워드가 아니라 동일 인과 메커니즘으로 묶는다.
   - 같은 기업의 다른 사건도 메커니즘이 다르면 분리한다.
   - 다른 기업의 같은 메커니즘은 하나로 통합한다.
2. 아래 "기존 스레드"와 동일 메커니즘이면 반드시 그 threadKey를 그대로 재사용하고
   matchedExisting=true로 표기한다. 신규 키 남발 금지.
3. 신규 스레드의 threadKey는 영문 snake_case로 만든다.
4. 각 아이템(member)에 industryTag를 1개 이상 부여한다. **폐쇄형 목록에서만 선택**한다.
   목록에 없는 자유 문자열은 금지. 아이템이 실제로 걸치는 산업만 태깅한다(남발 금지).
5. 단독 아이템(메커니즘 공유 없음)도 자체 스레드로 낸다.
6. JSON만 출력한다.

## 허용 industryTag(이 값만 사용)
${tagList}

## 기존 스레드(재사용 후보)
${candidateList}

## 이번 주 아이템
${itemList}

## 출력 JSON 스키마
{
  "threads": [
    {
      "threadKey": "english_snake_case",
      "label": "한글 스레드명(20자 이내)",
      "matchedExisting": false,
      "members": [ { "itemIndex": 0, "industryTags": ["semiconductor"] } ]
    }
  ]
}
JSON만 출력하라.`;
}

async function generateWithRetry(model: GenerativeModel, prompt: string, retries = 3, delay = 2000): Promise<string> {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (err: unknown) {
            const e = err as { status?: number; response?: { status?: number } };
            const status = e?.status ?? e?.response?.status;
            if ((status === 429 || status === 503) && attempt < retries) {
                await new Promise(r => setTimeout(r, delay * (attempt + 1)));
                continue;
            }
            throw err;
        }
    }
    throw new Error('generateWithRetry: exhausted');
}

/**
 * 아이템 배열을 클러스터링. industryTag reject 시 1회 재요청.
 * 재요청 후에도 남은 reject는 해당 태그만 드롭(전체 실패시키지 않음).
 */
export async function clusterItems(
    items: NormalizedItem[],
    candidates: ThreadCandidate[],
    domain: 'ai' | 'battery',
    opts: { maxTagRetries?: number } = {},
): Promise<ClusterAssignment[]> {
    if (items.length === 0) return [];
    const model = genAI.getGenerativeModel({ model: FLASH_MODEL });
    const candidateKeys = new Set(candidates.map(c => c.threadKey));
    const maxRetries = opts.maxTagRetries ?? 1;

    let rejectedNote: string[] | undefined;
    let lastAssignments: ClusterAssignment[] = [];
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const prompt = buildPrompt(items, candidates, domain, rejectedNote);
        const text = await generateWithRetry(model, prompt);
        const { assignments, rejectedTags } = parseAndSanitize(text, items, candidateKeys);
        lastAssignments = assignments;
        if (rejectedTags.length === 0) return assignments;
        rejectedNote = rejectedTags; // 다음 시도에서 remap 요청
        if (attempt === maxRetries) {
            console.warn(`[Clustering] industryTag reject 잔존(드롭): ${JSON.stringify(rejectedTags)}`);
        }
    }
    return lastAssignments;
}
