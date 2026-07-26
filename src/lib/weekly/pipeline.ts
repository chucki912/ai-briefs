/**
 * PASS 0-3 결정론 런타임 (T3) — 한 (주, 도메인)에 대한 클러스터링→게이트→등급.
 *
 * 백필과 live 라우트가 이 함수를 공유한다("실운영과 동일 코드 경로"). LLM은 PASS 1
 * 클러스터링만 담당하고, 게이트/등급/승격·강등은 전부 코드가 확정한다.
 *
 * PASS 4-6(본문·판단·구조화, T5)와 PASS 2.5(웹 보강, T4)는 이 결과를 입력으로 받는다.
 * webPriorEvidence 훅으로 T4를 미리 수용(미지정 시 internal 근거만).
 */
import type { ThreadIndexEntry } from '@/types';
import type {
    NormalizedItem, ClusterAssignment, ClusterMember, GateResult, DemotedReason,
} from './types';
import { startOfISOWeek, addDays, format } from 'date-fns';
import { collectCorpus } from './corpus';
import { clusterItems, type ThreadCandidate } from './clustering';
import { isoWeekKey } from '../thread-index';
import { kvThreadIndexStore, type ThreadIndexStore } from './thread-index-store';
import { evaluateGate } from './gate';
import {
    assignGrade, candidateMotionTypes, internalPriorEvidence,
    type Grade, type GradeResult, type MotionTypeCode, type PriorEvidence,
} from './grade';

const NUMERIC = /\d/;
const REP_METRICS_PER_WEEK = 6;

/** 수치를 담은 keyFact를 대표 메트릭 후보로 추출(dedup, 상한). */
export function extractMetrics(cluster: ClusterAssignment, itemsById: Map<string, NormalizedItem>): string[] {
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

/** 게이트 결과 + 이번 주 관측을 threadIndex 증분 엔트리로 변환(merge는 store.save). */
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
        anchorSourceIds: gate.publishers,
        domainTags: [domain],
        industryTags: gate.industryTags,
    };
}

export interface GradedThread {
    threadKey: string;
    label: string;
    matchedExisting: boolean;
    members: ClusterMember[];
    gate: GateResult;
    motionTypes: MotionTypeCode[];
    priorEvidence: PriorEvidence[];
    grade: Grade;
    gradeResult: GradeResult;
}

export type DemotedThreadReason = DemotedReason | 'no_prior_evidence';

export interface DemotedThread {
    threadKey: string;
    label: string;
    reason: DemotedThreadReason;   // 강등 사유(렌더 태그)
    memberCount: number;
}

export interface DeterministicWeekResult {
    isoWeek: string;
    domain: 'ai' | 'battery';
    itemCount: number;
    graded: GradedThread[];    // 모든 클러스터(등급 산정 완료)
    promoted: GradedThread[];  // hardGatePass AND grade !== 'demoted'
    demoted: DemotedThread[];
}

export interface RunDeterministicOptions {
    dates: string[];            // 대상 주의 일자들(YYYY-MM-DD)
    domain: 'ai' | 'battery';
    asOf: string | Date;        // priorWeeksInternal 기준(현재 주 write 이전)
    isoWeek: string;            // 대상 주 라벨
    store: ThreadIndexStore;
    persist: boolean;           // true면 관측을 threadIndex에 증분 기록
    /** T4(PASS 2.5) 웹 근거 주입 훅. 미지정 시 internal 근거만 사용. */
    webPriorEvidence?: (threadKey: string) => PriorEvidence[];
    /** 사전 수집된 코퍼스 주입(테스트/백필 재사용). 미지정 시 collectCorpus 호출. */
    items?: NormalizedItem[];
    /** 클러스터링 함수 주입(테스트용). 미지정 시 PASS 1 clusterItems(LLM). */
    clusterFn?: (items: NormalizedItem[], candidates: ThreadCandidate[], domain: 'ai' | 'battery') => Promise<ClusterAssignment[]>;
}

/** 한 (주, 도메인)의 PASS 0-3 실행. */
export async function runDeterministicPasses(opts: RunDeterministicOptions): Promise<DeterministicWeekResult> {
    const items = opts.items ?? await collectCorpus(opts.dates, opts.domain);
    const empty: DeterministicWeekResult = { isoWeek: opts.isoWeek, domain: opts.domain, itemCount: 0, graded: [], promoted: [], demoted: [] };
    if (items.length === 0) return empty;

    const candidates: ThreadCandidate[] = (await opts.store.getAll()).map(t => ({ threadKey: t.threadKey, label: t.label }));
    const clusters = await (opts.clusterFn ?? clusterItems)(items, candidates, opts.domain);
    const itemsById = new Map(items.map(i => [i.itemId, i]));

    const graded: GradedThread[] = [];
    for (const cluster of clusters) {
        const priorEntry = await opts.store.get(cluster.threadKey);
        const gate = evaluateGate(cluster, itemsById, priorEntry, { asOf: opts.asOf });

        const priorEvidence: PriorEvidence[] = [
            ...internalPriorEvidence(priorEntry, opts.asOf),
            ...(opts.webPriorEvidence?.(cluster.threadKey) ?? []),
        ];
        const motionTypes = candidateMotionTypes(gate.motionCandidates);
        const gradeResult = assignGrade({ priorWeeksInternal: gate.priorWeeksInternal, motionTypes, priorEvidence });

        graded.push({
            threadKey: cluster.threadKey, label: cluster.label, matchedExisting: cluster.matchedExisting,
            members: cluster.members, gate, motionTypes, priorEvidence,
            grade: gradeResult.grade, gradeResult,
        });

        // 승격 여부와 무관하게 관측을 인덱싱(단일일 스레드도 다음 주 M1 근거가 될 수 있음).
        if (opts.persist) {
            await opts.store.save(buildEntryFromGate(gate, cluster, itemsById, opts.isoWeek, opts.domain));
        }
    }

    const promoted = graded.filter(g => g.gate.hardGatePass && g.grade !== 'demoted');
    const demoted: DemotedThread[] = graded
        .filter(g => !(g.gate.hardGatePass && g.grade !== 'demoted'))
        .map(g => ({
            threadKey: g.threadKey,
            label: g.label,
            reason: !g.gate.hardGatePass ? (g.gate.demotedReasons[0] ?? 'single_date') : 'no_prior_evidence',
            memberCount: g.members.length,
        }));

    return { isoWeek: opts.isoWeek, domain: opts.domain, itemCount: items.length, graded, promoted, demoted };
}

/** asOf가 속한 ISO 주(월~일)의 YYYY-MM-DD 7일. */
export function currentIsoWeekDates(asOf: Date): string[] {
    const weekStart = startOfISOWeek(asOf);
    return Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), 'yyyy-MM-dd'));
}

/**
 * live 주간 진입점 — 현재 주(W)의 PASS 0-3을 실행한다. 라우트/T5 본문 생성이 호출한다.
 * priorWeeksInternal은 asOf 기준으로 과거 주만 카운트(현재 주는 persist 이전이라 미포함).
 * persist=true면 이번 주 관측을 threadIndex에 증분 기록(매 주간 실행 종료 시 갱신).
 */
export async function runWeeklyDeterministic(opts: {
    asOf: Date;
    domain: 'ai' | 'battery';
    persist: boolean;
    store?: ThreadIndexStore;
    webPriorEvidence?: (threadKey: string) => PriorEvidence[];
}): Promise<DeterministicWeekResult> {
    const dates = currentIsoWeekDates(opts.asOf);
    return runDeterministicPasses({
        dates,
        domain: opts.domain,
        asOf: opts.asOf,
        isoWeek: isoWeekKey(dates[0]),
        store: opts.store ?? kvThreadIndexStore,
        persist: opts.persist,
        webPriorEvidence: opts.webPriorEvidence,
    });
}
