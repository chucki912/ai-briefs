/**
 * PASS 4-6 오케스트레이터 (T5) — 승격 스레드별 본문·판단·구조화.
 *
 * 스레드별 파이프: PASS 4 본문 → motionType 확정 재등급 → PASS 5 판단 → PASS 6 구조화.
 * 스레드 간 동시도 2(비용/지연 균형). 승격 0건이면 빈 결과(없는 트렌드 만들지 않음).
 *
 * M1은 코드 확정(priorWeeksInternal)이라 모델 확정 대상이 아니다. M2/M4만 본문 근거로 확정.
 */
import type { NormalizedItem } from './types';
import type { DeterministicWeekResult, GradedThread, DemotedThread } from './pipeline';
import { assignGrade, type Grade, type MotionTypeCode } from './grade';
import { generateBody } from './body-gen';
import { getJudgmentProvider, type JudgmentProvider } from './judgment';
import { structureBody, type WeeklyTable } from './structure';

export interface WeeklyThreadContent {
    threadKey: string;
    label: string;
    grade: Grade;
    motionTypes: MotionTypeCode[];
    observedDates: string[];
    priorWeeksInternal: number;
    background: string;
    mainContent: string;
    implications: string;
    killTrigger: string;
    nextWeekCheck: string;
    table: WeeklyTable;
    metricsUsed: string[];
    anchorSourceIds: string[];
}

export interface WeeklyReportContent {
    isoWeek: string;
    domain: 'ai' | 'battery';
    threads: WeeklyThreadContent[];   // 승격·본문 생성 완료
    demoted: DemotedThread[];
    promotedCount: number;            // = threads.length
}

/** 동시 실행 상한 하에 매핑(순서 보존). */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    async function worker() {
        while (next < items.length) {
            const i = next++;
            out[i] = await fn(items[i], i);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
    return out;
}

/** M1은 코드 확정 유지, M2/M4는 본문 확정분만 채택. */
export function finalizeMotionTypes(candidates: MotionTypeCode[], confirmed: MotionTypeCode[]): MotionTypeCode[] {
    const keepM1 = candidates.includes('M1') ? ['M1' as MotionTypeCode] : [];
    const confSet = new Set(confirmed);
    const m2m4 = (['M2', 'M4'] as MotionTypeCode[]).filter(x => confSet.has(x));
    return Array.from(new Set([...keepM1, ...m2m4]));
}

type ThreadOutcome =
    | { kind: 'content'; content: WeeklyThreadContent }
    | { kind: 'demoted'; demoted: DemotedThread };

async function processThread(
    thread: GradedThread,
    items: NormalizedItem[],
    provider: JudgmentProvider,
): Promise<ThreadOutcome> {
    // PASS 4: 본문 초안 + motionType 확정
    const draft = await generateBody(thread, items);
    const finalMotions = finalizeMotionTypes(thread.motionTypes, draft.confirmedMotionTypes);

    // 재등급(하향 가능). 승격 스레드는 선행근거 보유 → demoted로 떨어지지 않으나 방어.
    const regrade = assignGrade({
        priorWeeksInternal: thread.gate.priorWeeksInternal,
        motionTypes: finalMotions,
        priorEvidence: thread.priorEvidence,
    });
    if (regrade.grade === 'demoted') {
        return { kind: 'demoted', demoted: { threadKey: thread.threadKey, label: thread.label, reason: 'no_prior_evidence', memberCount: thread.members.length } };
    }

    // PASS 5: 판단(시사점/킬트리거)
    const judgment = await provider.generate({
        threadKey: thread.threadKey, label: thread.label, grade: regrade.grade,
        motionTypes: finalMotions, priorWeeksInternal: thread.gate.priorWeeksInternal,
        priorEvidence: thread.priorEvidence, observedDates: thread.gate.observedDates,
        bodyText: draft.draftText,
    });

    // PASS 6: 구조화(실패 시 초안 텍스트를 mainContent로 폴백)
    const structured = await structureBody(draft.draftText);

    return {
        kind: 'content',
        content: {
            threadKey: thread.threadKey, label: thread.label, grade: regrade.grade, motionTypes: finalMotions,
            observedDates: thread.gate.observedDates, priorWeeksInternal: thread.gate.priorWeeksInternal,
            background: structured?.background ?? '',
            mainContent: structured?.mainContent ?? draft.draftText,
            implications: judgment.implications,
            killTrigger: judgment.killTrigger,
            nextWeekCheck: judgment.nextWeekCheck,
            table: structured?.table ?? { title: '', headers: [], rows: [] },
            metricsUsed: structured?.metricsUsed ?? [],
            anchorSourceIds: thread.gate.publishers,
        },
    };
}

/** 승격 스레드에 대해 PASS 4-6 실행(동시 2). 승격 0건이면 빈 threads. */
export async function generateWeeklyReportContent(
    result: DeterministicWeekResult,
    items: NormalizedItem[],
    opts: { concurrency?: number; provider?: JudgmentProvider } = {},
): Promise<WeeklyReportContent> {
    const provider = opts.provider ?? getJudgmentProvider();
    const concurrency = opts.concurrency ?? 2;

    const outcomes = await mapWithConcurrency(result.promoted, concurrency, (t) => processThread(t, items, provider));

    const threads: WeeklyThreadContent[] = [];
    const extraDemoted: DemotedThread[] = [];
    for (const o of outcomes) {
        if (o.kind === 'content') threads.push(o.content);
        else extraDemoted.push(o.demoted);
    }

    return {
        isoWeek: result.isoWeek,
        domain: result.domain,
        threads,
        demoted: [...result.demoted, ...extraDemoted],
        promotedCount: threads.length,
    };
}
