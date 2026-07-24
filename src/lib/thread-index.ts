/**
 * threadIndex 액세스 레이어 — 주간 트렌드 파이프라인 v2 (T1)
 *
 * 과거 관측을 threadKey 단위로 누적한다. 게이트/등급 판정의 결정론적 근거:
 *   - priorWeeksInternal (최근 8주 중 관측된 주차 수) = weeklyCounts 조회
 *   - M1(지속·누적) 후보 = priorWeeksInternal >= 1
 *   - M4(확산·전이) 후보 = distinct(industryTags) — PASS 2/3에서 사용
 *
 * 저장 전략:
 *   기존 store.ts의 제네릭 kvSet/kvGet(4개 어댑터 모두 구현됨)을 재사용한다.
 *   물리 키는 {prefix}:kv:threadIndex:{threadKey} (논리 네임스페이스 threadIndex:).
 *   전용 어댑터 메서드를 추가하지 않아 4개 스토리지에서 무변경으로 동작한다.
 *   열거(PASS 1 매칭 후보/백필)는 레지스트리 키가 threadKey 집합을 보관한다.
 *
 * TTL(TTL/병렬 지침):
 *   원본 브리핑(90일)과 분리. THREAD_INDEX_TTL_SECONDS = 400일(>=365일 요건 충족).
 *   활성 스레드는 매 주간 실행마다 재기록되어 TTL이 갱신되므로 사실상 무기한.
 *   레지스트리도 매 upsert마다 재기록되어 운영 중 만료되지 않는다.
 *
 * 불변식:
 *   - industryTags / domainTags / representativeMetrics / anchorSourceIds 는 add-only.
 *     기존 값은 상속되며 삭제되지 않는다.
 *   - weeklyCounts는 주(isoWeek) 단위 overwrite(멱등). 같은 주 재실행이 합산되지 않는다.
 */

import { getISOWeek, getISOWeekYear } from 'date-fns';
import { kvGet, kvSet } from './store';
import type { ThreadIndexEntry } from '@/types';
import { validateIndustryTags, type IndustryTag } from '@/configs/industry-tags';

/** 논리 키 프리픽스(물리 키는 store.kvSet이 {prefix}:kv: 를 덧붙인다). */
const THREAD_KEY_PREFIX = 'threadIndex:';
/** 전체 threadKey 집합을 보관하는 레지스트리 키(열거용). */
const REGISTRY_KEY = 'threadIndex:__registry__';
/** 400일 — 원본 브리핑 90일과 분리, >=365일 요건 충족. 활성 스레드는 매주 갱신. */
export const THREAD_INDEX_TTL_SECONDS = 400 * 24 * 60 * 60;

// ── ISO 주차 ────────────────────────────────────────────────────────────────

/**
 * YYYY-MM-DD(또는 battery-YYYY-MM-DD)를 ISO 주차 키로 변환. 예: "2026-W30".
 * TZ 드리프트를 피하기 위해 연·월·일 성분으로 로컬 자정 Date를 구성한다.
 */
export function isoWeekKey(date: string | Date): string {
    let d: Date;
    if (date instanceof Date) {
        d = date;
    } else {
        const clean = date.replace(/^battery-/, '').trim();
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(clean);
        if (!m) throw new Error(`isoWeekKey: 파싱 불가한 날짜 "${date}"`);
        d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    const isoYear = getISOWeekYear(d);
    const week = getISOWeek(d);
    return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/**
 * weeklyCounts에서 기준일 시점 최근 N개 ISO 주차(기준 주 포함) 중 관측된(>0)
 * 주차 수 = priorWeeksInternal. 기본 8주.
 * asOf를 넘기지 않으면 오늘 기준(운영 실행 시점).
 */
export function priorWeeksInternal(
    entry: Pick<ThreadIndexEntry, 'weeklyCounts'> | null | undefined,
    asOf: string | Date = new Date(),
    windowWeeks = 8,
): number {
    if (!entry?.weeklyCounts) return 0;
    const windowKeys = recentIsoWeekKeys(asOf, windowWeeks);
    const windowSet = new Set(windowKeys);
    let count = 0;
    for (const [wk, c] of Object.entries(entry.weeklyCounts)) {
        if (c > 0 && windowSet.has(wk)) count++;
    }
    return count;
}

/** asOf 주를 포함해 과거로 windowWeeks개의 ISO 주차 키 배열(최신→과거). */
export function recentIsoWeekKeys(asOf: string | Date = new Date(), windowWeeks = 8): string[] {
    const base = asOf instanceof Date ? new Date(asOf) : (() => {
        const clean = String(asOf).replace(/^battery-/, '').trim();
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(clean);
        if (!m) throw new Error(`recentIsoWeekKeys: 파싱 불가한 날짜 "${asOf}"`);
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    })();
    const keys: string[] = [];
    for (let i = 0; i < windowWeeks; i++) {
        const d = new Date(base);
        d.setDate(d.getDate() - i * 7);
        keys.push(isoWeekKey(d));
    }
    return keys;
}

// ── 순수 merge(add-only) ─────────────────────────────────────────────────────

const uniq = <T,>(xs: T[]): T[] => Array.from(new Set(xs));
const REP_METRICS_CAP = 50;
const ANCHOR_IDS_CAP = 100;

/** YYYY-MM-DD 문자열 최소/최대(빈 값은 무시). */
function minDate(a: string, b: string): string {
    if (!a) return b;
    if (!b) return a;
    return a <= b ? a : b;
}
function maxDate(a: string, b: string): string {
    if (!a) return b;
    if (!b) return a;
    return a >= b ? a : b;
}

/**
 * 기존 엔트리와 새 관측을 병합. 순수 함수(부수효과 없음) — 단위 테스트 대상.
 *   - 태그/메트릭/앵커: add-only 합집합(dedup). incoming이 제거를 요청해도 무시.
 *   - weeklyCounts: incoming 주차 버킷으로 overwrite(멱등).
 *   - industryTags: incoming은 이미 검증된 IndustryTag[]여야 한다(호출 전 validate).
 */
export function mergeThreadIndex(
    existing: ThreadIndexEntry | null,
    incoming: ThreadIndexEntry,
): ThreadIndexEntry {
    if (!existing) {
        // 신규 스레드도 자체 필드 내 중복은 정리해 저장한다.
        return {
            ...incoming,
            representativeMetrics: uniq(incoming.representativeMetrics ?? []).slice(-REP_METRICS_CAP),
            anchorSourceIds: uniq(incoming.anchorSourceIds ?? []).slice(-ANCHOR_IDS_CAP),
            domainTags: uniq(incoming.domainTags ?? []),
            industryTags: uniq(incoming.industryTags ?? []),
        };
    }

    return {
        threadKey: existing.threadKey, // 안정 식별자 — 절대 변경하지 않는다
        label: incoming.label?.trim() ? incoming.label : existing.label, // 최신 관측 우선
        firstObservedAt: minDate(existing.firstObservedAt, incoming.firstObservedAt),
        lastObservedAt: maxDate(existing.lastObservedAt, incoming.lastObservedAt),
        weeklyCounts: { ...existing.weeklyCounts, ...incoming.weeklyCounts }, // 주 단위 overwrite
        representativeMetrics: uniq([
            ...(existing.representativeMetrics ?? []),
            ...(incoming.representativeMetrics ?? []),
        ]).slice(-REP_METRICS_CAP),
        anchorSourceIds: uniq([
            ...(existing.anchorSourceIds ?? []),
            ...(incoming.anchorSourceIds ?? []),
        ]).slice(-ANCHOR_IDS_CAP),
        domainTags: uniq([...(existing.domainTags ?? []), ...(incoming.domainTags ?? [])]),
        industryTags: uniq([
            ...(existing.industryTags ?? []),
            ...(incoming.industryTags ?? []),
        ]) as IndustryTag[],
    };
}

// ── KV 접근 ──────────────────────────────────────────────────────────────────

function threadStoreKey(threadKey: string): string {
    return `${THREAD_KEY_PREFIX}${threadKey}`;
}

/** 단일 스레드 조회. 없으면 null. */
export async function getThreadIndex(threadKey: string): Promise<ThreadIndexEntry | null> {
    return kvGet<ThreadIndexEntry>(threadStoreKey(threadKey));
}

/** 등록된 전체 threadKey 목록(레지스트리). */
export async function listThreadKeys(): Promise<string[]> {
    const keys = await kvGet<string[]>(REGISTRY_KEY);
    return Array.isArray(keys) ? keys : [];
}

/** 전체 threadIndex 엔트리(만료/누락은 자동 제외). PASS 1 매칭 후보·백필용. */
export async function getAllThreadIndexes(): Promise<ThreadIndexEntry[]> {
    const keys = await listThreadKeys();
    const entries = await Promise.all(keys.map((k) => getThreadIndex(k)));
    return entries.filter((e): e is ThreadIndexEntry => e !== null);
}

/** 레지스트리에 threadKey를 add-only로 등록(멱등). */
async function registerThreadKey(threadKey: string): Promise<void> {
    const keys = await listThreadKeys();
    if (keys.includes(threadKey)) {
        // 등록은 되어 있으나 TTL 갱신을 위해 재기록.
        await kvSet(REGISTRY_KEY, keys, THREAD_INDEX_TTL_SECONDS);
        return;
    }
    await kvSet(REGISTRY_KEY, [...keys, threadKey], THREAD_INDEX_TTL_SECONDS);
}

/**
 * upsert — 기존 엔트리와 add-only 병합 후 저장하고 레지스트리에 등록.
 * industryTags는 저장 직전 다시 검증한다(방어). rejected가 있으면 throw —
 * 자유 문자열이 인덱스에 침투하지 못하게 한다(호출자 PASS 1/3이 재요청).
 * 병합 결과 엔트리를 반환한다.
 */
export async function saveThreadIndex(incoming: ThreadIndexEntry): Promise<ThreadIndexEntry> {
    if (!incoming.threadKey?.trim()) {
        throw new Error('saveThreadIndex: threadKey가 비어 있음');
    }
    const { valid, rejected } = validateIndustryTags(incoming.industryTags);
    if (rejected.length > 0) {
        throw new Error(
            `saveThreadIndex("${incoming.threadKey}"): 사전에 없는 industryTag ${JSON.stringify(rejected)} — 재요청 필요`,
        );
    }
    const existing = await getThreadIndex(incoming.threadKey);
    const merged = mergeThreadIndex(existing, { ...incoming, industryTags: valid });

    await kvSet(threadStoreKey(incoming.threadKey), merged, THREAD_INDEX_TTL_SECONDS);
    await registerThreadKey(incoming.threadKey);
    return merged;
}

/**
 * 스레드 전체 삭제 — 유지보수/테스트/백필 재시작 전용. 운영 주간 플로우는
 * 스레드를 삭제하지 않는다(태그 add-only 불변식과 별개). 레지스트리에서도 제거.
 */
export async function deleteThreadIndex(threadKey: string): Promise<void> {
    await kvSet(threadStoreKey(threadKey), null, THREAD_INDEX_TTL_SECONDS);
    const keys = await listThreadKeys();
    if (keys.includes(threadKey)) {
        await kvSet(REGISTRY_KEY, keys.filter((k) => k !== threadKey), THREAD_INDEX_TTL_SECONDS);
    }
}
