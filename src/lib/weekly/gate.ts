/**
 * PASS 2 — 1차 게이트 (결정론적 계산, LLM 개입 금지) (T2)
 *
 * 스레드별로 시간 폭·출처 독립성·과거 관측 주차를 코드가 확정한다.
 * 하드 게이트: observedDates >= 2 AND publisherCount >= 2.
 * 운동유형 후보(M1/M2/M4)만 산출하며 확정은 PASS 4. M3/M5는 코드 판정 불가.
 *
 * 순수 함수 — 부수효과 없음. threadIndex 조회는 호출자가 주입한다.
 */
import type { IndustryTag } from '@/configs/industry-tags';
import type { ThreadIndexEntry } from '@/types';
import type {
    ClusterAssignment, ClusterMember, GateResult, MotionCandidates, NormalizedItem, DemotedReason,
} from './types';
import { priorWeeksInternal } from '../thread-index';
import { isDenylistedDomain } from '../validate-triangulation';
import { SOURCE_TIERING } from '../validation-config';

const NUMERIC = /\d/;

/**
 * M4 교차-아이템 판정: distinct(industryTags) >= 2 AND 두 태그를 서로 다른 아이템이
 * 각각 뒷받침(단일 기사에 복수 태그가 붙어 통과하는 경로 차단).
 *
 * 조건: 서로 다른 태그 t1,t2가 존재해 t1을 가진 아이템과 t2를 가진 아이템을
 *   서로 다르게 고를 수 있다. 태그쌍의 아이템 집합 합집합 크기가 2 이상이면
 *   size-2 매칭이 항상 성립(Hall 조건 만족).
 */
export function m4CrossItemCandidate(members: ClusterMember[]): boolean {
    // 태그 → 그 태그를 가진 itemId 집합
    const tagToItems = new Map<IndustryTag, Set<string>>();
    for (const m of members) {
        for (const tag of m.industryTags) {
            if (!tagToItems.has(tag)) tagToItems.set(tag, new Set());
            tagToItems.get(tag)!.add(m.itemId);
        }
    }
    const tags = Array.from(tagToItems.keys());
    if (tags.length < 2) return false;
    for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
            const union = new Set([...tagToItems.get(tags[i])!, ...tagToItems.get(tags[j])!]);
            if (union.size >= 2) return true; // 서로 다른 대표 아이템 배정 가능
        }
    }
    return false;
}

/**
 * M2 후보(가속·임계) 휴리스틱 — 확정 아님. PASS 4가 두 시점 수치·변화율로 확정한다.
 * 서로 다른 2개 이상 날짜에서 수치를 담은 keyFact가 관측되면 후보로 본다.
 */
function m2Candidate(members: ClusterMember[], itemsById: Map<string, NormalizedItem>): boolean {
    const datesWithNumbers = new Set<string>();
    for (const m of members) {
        const item = itemsById.get(m.itemId);
        if (!item) continue;
        if (item.keyFacts.some(f => NUMERIC.test(f))) datesWithNumbers.add(item.publishedAt);
    }
    return datesWithNumbers.size >= 2;
}

/** 스레드 게이트 평가. observedDates/publisherCount/priorWeeksInternal 확정. */
export function evaluateGate(
    cluster: ClusterAssignment,
    itemsById: Map<string, NormalizedItem>,
    priorEntry: ThreadIndexEntry | null,
    opts: { asOf: string | Date; windowWeeks?: number },
): GateResult {
    const items = cluster.members
        .map(m => itemsById.get(m.itemId))
        .filter((x): x is NormalizedItem => x !== undefined);

    const observedDates = Array.from(new Set(items.map(i => i.publishedAt))).sort();

    // 출처 독립성: distinct registrable domain(denylist 제외)
    const publisherSet = new Set<string>();
    for (const it of items) {
        for (const d of it.publisherDomains) {
            if (isDenylistedDomain(d, SOURCE_TIERING.AGGREGATOR_DENYLIST)) continue;
            publisherSet.add(d);
        }
    }
    const publishers = Array.from(publisherSet).sort();
    const publisherCount = publishers.length;

    const weeks = priorWeeksInternal(priorEntry, opts.asOf, opts.windowWeeks ?? 8);

    const industryTags = Array.from(new Set(cluster.members.flatMap(m => m.industryTags))) as IndustryTag[];

    const motionCandidates: MotionCandidates = {
        M1: weeks >= 1,
        M2: m2Candidate(cluster.members, itemsById),
        M4: m4CrossItemCandidate(cluster.members),
    };

    const demotedReasons: DemotedReason[] = [];
    if (observedDates.length < 2) demotedReasons.push('single_date');
    if (publisherCount < 2) demotedReasons.push('single_publisher');
    const hardGatePass = demotedReasons.length === 0;

    return {
        threadKey: cluster.threadKey,
        label: cluster.label,
        matchedExisting: cluster.matchedExisting,
        observedDates,
        publisherCount,
        publishers,
        priorWeeksInternal: weeks,
        hardGatePass,
        demotedReasons,
        motionCandidates,
        industryTags,
        memberItemIds: items.map(i => i.itemId),
    };
}
