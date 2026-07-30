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
import { validateWeeklyThread, hasHardFailure, buildRegenFeedback, sharedBodyEightGrams } from './validate-weekly';
import { repairThreadLengths } from './length-repair';

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

/** attemptTrace — DoD 검증 시도 기록(기존 진단 구조 재사용). */
export interface WeeklyAttemptEntry {
    attempt: number;         // 0=최초, 1=재생성
    hardFailures: string[];  // hard 위반 rule 목록
    softFailures: string[];
    elapsedSec: number;
}

export interface WeeklyReportContent {
    isoWeek: string;
    domain: 'ai' | 'battery';
    threads: WeeklyThreadContent[];   // 승격·본문 생성·DoD 통과
    demoted: DemotedThread[];
    promotedCount: number;            // = threads.length
    attemptTraces: Record<string, WeeklyAttemptEntry[]>; // threadKey → 시도 기록
}

const MAX_REGEN = 1; // 재생성 1회(800s 안착), 재실패 시 강등
const MAX_PROMOTED = 5; // 스펙: 트렌드 스레드 3~5개. 초과 시 등급·관측폭 상위로 컷(본문생성 전).
const GRADE_RANK: Record<Grade, number> = { A: 3, B: 2, C: 1, demoted: 0 };

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
    | { kind: 'content'; content: WeeklyThreadContent; trace: WeeklyAttemptEntry[] }
    | { kind: 'demoted'; demoted: DemotedThread; trace: WeeklyAttemptEntry[] };

/** PASS 4→재등급→PASS 5→PASS 6 1회 실행(선택적 재생성 피드백). */
async function buildThreadContent(
    thread: GradedThread,
    items: NormalizedItem[],
    provider: JudgmentProvider,
    regenFeedback: string | undefined,
): Promise<WeeklyThreadContent | null> {
    // PASS 4: 본문 초안 + motionType 확정
    const draft = await generateBody(thread, items, regenFeedback);
    const finalMotions = finalizeMotionTypes(thread.motionTypes, draft.confirmedMotionTypes);

    // 재등급(하향 가능). 승격 스레드는 선행근거 보유 → demoted로 떨어지지 않으나 방어.
    const regrade = assignGrade({
        priorWeeksInternal: thread.gate.priorWeeksInternal,
        motionTypes: finalMotions,
        priorEvidence: thread.priorEvidence,
    });
    if (regrade.grade === 'demoted') return null;

    // PASS 5: 판단(시사점/킬트리거)
    const judgment = await provider.generate({
        threadKey: thread.threadKey, label: thread.label, grade: regrade.grade,
        motionTypes: finalMotions, priorWeeksInternal: thread.gate.priorWeeksInternal,
        priorEvidence: thread.priorEvidence, observedDates: thread.gate.observedDates,
        bodyText: draft.draftText, regenFeedback,
    });

    // PASS 6: 구조화(실패 시 초안 텍스트를 mainContent로 폴백)
    const structured = await structureBody(draft.draftText);

    const content: WeeklyThreadContent = {
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
    };

    // PASS 6.5: 결정론적 길이 보정(재생성 전 창 안으로 유도 → 재생성 빈도·타이밍 완화)
    return repairThreadLengths(content);
}

/** PASS 7: 검증 → hard 위반 시 재생성 1회 → 재실패 시 강등. attemptTrace 기록. */
async function processThread(
    thread: GradedThread,
    items: NormalizedItem[],
    provider: JudgmentProvider,
    buildFn: BuildThreadContentFn = buildThreadContent,
): Promise<ThreadOutcome> {
    const trace: WeeklyAttemptEntry[] = [];
    let content: WeeklyThreadContent | null = null;
    let feedback: string | undefined;

    for (let attempt = 0; attempt <= MAX_REGEN; attempt++) {
        const t0 = Date.now();
        const built = await buildFn(thread, items, provider, feedback);
        if (!built) {
            // 재등급으로 강등(선행근거 소실) — 재생성 대상 아님
            trace.push({ attempt, hardFailures: ['regrade_demoted'], softFailures: [], elapsedSec: (Date.now() - t0) / 1000 });
            return { kind: 'demoted', demoted: { threadKey: thread.threadKey, label: thread.label, reason: 'no_prior_evidence', memberCount: thread.members.length }, trace };
        }
        const fails = validateWeeklyThread(built);
        trace.push({
            attempt,
            hardFailures: fails.filter(f => f.severity === 'hard').map(f => f.rule),
            softFailures: fails.filter(f => f.severity === 'soft').map(f => f.rule),
            elapsedSec: (Date.now() - t0) / 1000,
        });
        content = built;
        if (!hasHardFailure(fails)) return { kind: 'content', content, trace };
        feedback = buildRegenFeedback(fails); // 다음 시도 교정 지시
    }

    // 재생성 후에도 hard 위반 → 강등(스펙: 재실패 시 강등)
    return { kind: 'demoted', demoted: { threadKey: thread.threadKey, label: thread.label, reason: 'dod_failed', memberCount: thread.members.length }, trace };
}

/** 본문 생성 함수 시그니처 — 테스트에서 위반 산출물을 강제 주입해 검증 경로를 확인하기 위한
 *  주입점(pipeline의 clusterFn 주입과 동일 패턴). 프로덕션은 기본값(buildThreadContent) 사용. */
export type BuildThreadContentFn = (
    thread: GradedThread, items: NormalizedItem[], provider: JudgmentProvider, feedback?: string,
) => Promise<WeeklyThreadContent | null>;

/** 승격 스레드에 대해 PASS 4-6 실행(동시 2). 승격 0건이면 빈 threads. */
export async function generateWeeklyReportContent(
    result: DeterministicWeekResult,
    items: NormalizedItem[],
    opts: { concurrency?: number; provider?: JudgmentProvider; buildFn?: BuildThreadContentFn } = {},
): Promise<WeeklyReportContent> {
    const provider = opts.provider ?? getJudgmentProvider();
    const concurrency = opts.concurrency ?? 2;

    // 스펙: 트렌드 스레드 3~5개. 초과 시 등급·관측폭 상위로 컷(본문생성 전 — 비용·시간 절약).
    const ranked = [...result.promoted].sort((a, b) =>
        GRADE_RANK[b.grade] - GRADE_RANK[a.grade] || b.gate.priorWeeksInternal - a.gate.priorWeeksInternal);
    const selected = ranked.slice(0, MAX_PROMOTED);
    const cut = ranked.slice(MAX_PROMOTED);
    if (cut.length > 0) {
        console.log(`[WeeklyReport] 승격 후보 ${ranked.length}건 중 상위 ${MAX_PROMOTED}건만 작성(스펙 상한). 컷: ${cut.map(c => `${c.threadKey}(${c.grade})`).join(', ')}`);
    }

    const buildFn = opts.buildFn ?? buildThreadContent;
    const outcomes = await mapWithConcurrency(selected, concurrency, (t) => processThread(t, items, provider, buildFn));

    const extraDemoted: DemotedThread[] = [];
    const attemptTraces: Record<string, WeeklyAttemptEntry[]> = {};
    // selected(등급 랭크) 순서 유지 — i<j에서 j가 하위 랭크(겹침 시 재생성/강등 대상).
    const contents: { content: WeeklyThreadContent; thread: GradedThread }[] = [];
    for (let i = 0; i < outcomes.length; i++) {
        const o = outcomes[i];
        attemptTraces[selected[i].threadKey] = o.trace;
        if (o.kind === 'content') contents.push({ content: o.content, thread: selected[i] });
        else extraDemoted.push(o.demoted);
    }

    // 8-gram 중복 DoD(스펙: 승격 쌍 간 본문 8-gram 중복 0건 — 0-tolerance, 비율 임계 아님).
    // 공유 8-gram이 하나라도 있으면 하위 랭크 재생성 1회 → 재실패 시 강등. 인용 원문은 제외.
    const bodyOf = (c: WeeklyThreadContent) => `${c.background} ${c.mainContent} ${c.implications}`;
    const demotedIdx = new Set<number>();
    for (let i = 0; i < contents.length; i++) {
        if (demotedIdx.has(i)) continue;
        for (let j = i + 1; j < contents.length; j++) {
            if (demotedIdx.has(j)) continue;
            const shared = sharedBodyEightGrams(bodyOf(contents[i].content), bodyOf(contents[j].content));
            if (shared.length === 0) continue;
            console.warn(`[8gram DoD] "${contents[i].thread.threadKey}"×"${contents[j].thread.threadKey}" 공유 8-gram ${shared.length}건 → 재생성: ${JSON.stringify(shared.slice(0, 2))}`);
            const fb = `다른 승격 사안과 본문 표현이 겹친다(공유 문장: ${JSON.stringify(shared.slice(0, 2))}). 이 사안(${contents[j].thread.label}) 고유의 사실·수치로 차별화해 다시 쓰라. 공통 배경 서술을 줄이고 이 사안만의 전개에 집중.`;
            const rebuilt = await buildFn(contents[j].thread, items, provider, fb);
            if (rebuilt && sharedBodyEightGrams(bodyOf(contents[i].content), bodyOf(rebuilt)).length === 0) {
                contents[j] = { content: rebuilt, thread: contents[j].thread };
            } else {
                console.warn(`[8gram DoD] "${contents[j].thread.threadKey}" 재생성 후에도 "${contents[i].thread.threadKey}"와 과다 겹침 → 강등`);
                demotedIdx.add(j);
                extraDemoted.push({ threadKey: contents[j].thread.threadKey, label: contents[j].thread.label, reason: 'dod_failed', memberCount: contents[j].thread.members.length });
            }
        }
    }
    const threads: WeeklyThreadContent[] = contents.filter((_, i) => !demotedIdx.has(i)).map(c => c.content);

    return {
        isoWeek: result.isoWeek,
        domain: result.domain,
        threads,
        demoted: [...result.demoted, ...extraDemoted],
        promotedCount: threads.length,
        attemptTraces,
    };
}
