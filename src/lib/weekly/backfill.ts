/**
 * 백필 코어 (T2) — 최근 N주를 주 단위 시간순으로 증분 처리해 threadIndex를 구성한다.
 *
 * 설계 원칙(백필 지침):
 *   - W-N → W-1 시간순 증분. 일괄 클러스터링 금지.
 *   - 각 주 실행 시 "그 시점까지 누적된 threadIndex"만 매칭 후보로 제공한다.
 *     시간순으로 진행하며 write하므로 getAllThreadIndexes()가 자연히 그 시점 누적본을 준다.
 *   - 실운영과 동일 코드 경로(PASS 0 collectCorpus / PASS 1 clusterItems / PASS 2 evaluateGate)를 쓴다.
 *   - PASS 0~2만 태운다(웹 보강 PASS 2.5·본문 생성은 백필 대상 아님).
 *
 * priorWeeksInternal 정합성: 각 주의 게이트를 "현재 주 write 이전"에 계산하므로
 * priorEntry는 이전 주들만 담는다 → M1/priorWeeksInternal은 과거 관측만 반영.
 */
import { startOfISOWeek, subWeeks, addDays, format } from 'date-fns';
import type { ThreadIndexEntry } from '@/types';
import type { GateResult, NormalizedItem, ClusterAssignment } from './types';
import { collectCorpus } from './corpus';
import { clusterItems, type ThreadCandidate } from './clustering';
import { evaluateGate } from './gate';
import {
    getAllThreadIndexes, getThreadIndex, saveThreadIndex, isoWeekKey,
} from '../thread-index';

const NUMERIC = /\d/;
const REP_METRICS_PER_WEEK = 6;

/** base 기준 offset주 전 ISO 주(월~일)의 YYYY-MM-DD 7일. */
export function isoWeekDates(base: Date, weekOffset: number): string[] {
    const weekStart = startOfISOWeek(subWeeks(base, weekOffset));
    return Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), 'yyyy-MM-dd'));
}

/** 수치를 담은 keyFact를 대표 메트릭 후보로 추출(dedup, 상한). */
function extractMetrics(cluster: ClusterAssignment, itemsById: Map<string, NormalizedItem>): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const m of cluster.members) {
        const item = itemsById.get(m.itemId);
        if (!item) continue;
        for (const f of item.keyFacts) {
            if (NUMERIC.test(f) && !seen.has(f)) { seen.add(f); out.push(f); }
            if (out.length >= REP_METRICS_PER_WEEK) return out;
        }
    }
    return out;
}

/** 게이트 결과 + 이번 주 관측을 threadIndex 증분 엔트리로 변환(merge는 saveThreadIndex). */
export function buildEntryFromGate(
    gate: GateResult,
    cluster: ClusterAssignment,
    itemsById: Map<string, NormalizedItem>,
    isoWeek: string,
    domain: 'ai' | 'battery',
): ThreadIndexEntry {
    const dates = gate.observedDates;
    return {
        threadKey: gate.threadKey,
        label: gate.label,
        firstObservedAt: dates[0] ?? '',
        lastObservedAt: dates[dates.length - 1] ?? '',
        weeklyCounts: { [isoWeek]: cluster.members.length },
        representativeMetrics: extractMetrics(cluster, itemsById),
        anchorSourceIds: gate.publishers, // 발행 주체 도메인을 안정 앵커로(백필 단계 정의)
        domainTags: [domain],
        industryTags: gate.industryTags,
    };
}

export interface WeekDomainStat {
    isoWeek: string;
    domain: 'ai' | 'battery';
    itemCount: number;
    threadCount: number;
    gatedCount: number;       // hardGatePass
    demotedCount: number;
    singletonThreadCount: number; // members.length === 1
    newThreadCount: number;
    matchedThreadCount: number;
    m1Count: number;          // priorWeeksInternal >= 1
}

export interface BackfillOptions {
    asOfDate: Date;
    weeks: number;                 // 백필 주 수(기본 8)
    domains: ('ai' | 'battery')[];
    write: boolean;                // false면 dry-run(threadIndex 미기록)
    onLog?: (msg: string) => void;
}

export interface BackfillResult {
    stats: WeekDomainStat[];
    threadsWritten: number;
}

/** 백필 실행. dry-run이면 통계만 산출하고 write하지 않는다. */
export async function runBackfill(opts: BackfillOptions): Promise<BackfillResult> {
    const log = opts.onLog ?? (() => { });
    const stats: WeekDomainStat[] = [];
    let threadsWritten = 0;

    // 시간순(오래된 주 → 최근 주): offset weeks..1
    for (let offset = opts.weeks; offset >= 1; offset--) {
        const dates = isoWeekDates(opts.asOfDate, offset);
        const weekStart = dates[0];
        const asOf = dates[dates.length - 1]; // 그 주 일요일 기준(현재 주 미기록 상태에서 과거만 카운트)
        const isoWeek = isoWeekKey(weekStart);

        for (const domain of opts.domains) {
            const items = await collectCorpus(dates, domain);
            if (items.length === 0) {
                stats.push({
                    isoWeek, domain, itemCount: 0, threadCount: 0, gatedCount: 0, demotedCount: 0,
                    singletonThreadCount: 0, newThreadCount: 0, matchedThreadCount: 0, m1Count: 0,
                });
                log(`${isoWeek} [${domain}] 아이템 0건 — 건너뜀`);
                continue;
            }

            const candidates: ThreadCandidate[] = (await getAllThreadIndexes())
                .map(t => ({ threadKey: t.threadKey, label: t.label }));

            const clusters = await clusterItems(items, candidates, domain);
            const itemsById = new Map(items.map(i => [i.itemId, i]));

            let gated = 0, demoted = 0, singleton = 0, fresh = 0, matched = 0, m1 = 0;
            for (const cluster of clusters) {
                const priorEntry = await getThreadIndex(cluster.threadKey);
                const gate = evaluateGate(cluster, itemsById, priorEntry, { asOf });

                if (gate.hardGatePass) gated++; else demoted++;
                if (cluster.members.length === 1) singleton++;
                if (cluster.matchedExisting) matched++; else fresh++;
                if (gate.motionCandidates.M1) m1++;

                if (opts.write) {
                    await saveThreadIndex(buildEntryFromGate(gate, cluster, itemsById, isoWeek, domain));
                    threadsWritten++;
                }
            }

            stats.push({
                isoWeek, domain, itemCount: items.length, threadCount: clusters.length,
                gatedCount: gated, demotedCount: demoted, singletonThreadCount: singleton,
                newThreadCount: fresh, matchedThreadCount: matched, m1Count: m1,
            });
            log(`${isoWeek} [${domain}] items=${items.length} threads=${clusters.length} gated=${gated} demoted=${demoted} singleton=${singleton} matched=${matched} m1=${m1}`);
        }
    }

    return { stats, threadsWritten };
}
