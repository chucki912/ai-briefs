/**
 * 백필 코어 (T2, T3에서 런타임 공유로 리팩터링) — 최근 N주를 주 단위 시간순 증분
 * 처리해 threadIndex를 구성하고 주차별 분포를 산출한다.
 *
 * 설계 원칙(백필 지침):
 *   - W-N → W-1 시간순 증분. 일괄 클러스터링 금지.
 *   - 각 주 실행 시 "그 시점까지 누적된 threadIndex"만 매칭 후보로 제공(store 누적).
 *   - 실운영과 동일 코드 경로: live 라우트와 동일한 runDeterministicPasses(PASS 0-3)를 호출한다.
 *   - PASS 0~3만 태운다(웹 보강 PASS 2.5·본문 생성은 백필 대상 아님).
 *
 * dry-run(write=false)은 InMemory store로 주 간 matched/M1을 프로덕션 오염 없이 측정.
 */
import { startOfISOWeek, subWeeks, addDays, format } from 'date-fns';
import { runDeterministicPasses } from './pipeline';
import { kvThreadIndexStore, InMemoryThreadIndexStore, type ThreadIndexStore } from './thread-index-store';
import { isoWeekKey } from '../thread-index';

/** base 기준 offset주 전 ISO 주(월~일)의 YYYY-MM-DD 7일. */
export function isoWeekDates(base: Date, weekOffset: number): string[] {
    const weekStart = startOfISOWeek(subWeeks(base, weekOffset));
    return Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), 'yyyy-MM-dd'));
}

export interface WeekDomainStat {
    isoWeek: string;
    domain: 'ai' | 'battery';
    itemCount: number;
    threadCount: number;
    gatedCount: number;       // hardGatePass
    demotedCount: number;     // 전체 강등(하드게이트 실패 + 등급 demoted)
    promotedCount: number;    // 승격(hardGatePass AND grade!=='demoted')
    gradeA: number;
    gradeB: number;
    gradeC: number;
    singletonThreadCount: number;
    newThreadCount: number;
    matchedThreadCount: number;
    m1Count: number;
}

export interface BackfillOptions {
    asOfDate: Date;
    weeks: number;
    domains: ('ai' | 'battery')[];
    write: boolean;                // true면 프로덕션 KV 영속, false면 인메모리 누적(측정용)
    store?: ThreadIndexStore;      // 주입 override(테스트용)
    onLog?: (msg: string) => void;
}

export interface BackfillResult {
    stats: WeekDomainStat[];
    threadsWritten: number;
}

/** 백필 실행. dry-run이면 인메모리 store로 누적(프로덕션 미기록). */
export async function runBackfill(opts: BackfillOptions): Promise<BackfillResult> {
    const log = opts.onLog ?? (() => { });
    const stats: WeekDomainStat[] = [];
    let threadsWritten = 0;
    const store: ThreadIndexStore = opts.store ?? (opts.write ? kvThreadIndexStore : new InMemoryThreadIndexStore());

    for (let offset = opts.weeks; offset >= 1; offset--) {
        const dates = isoWeekDates(opts.asOfDate, offset);
        const asOf = dates[dates.length - 1]; // 그 주 일요일(현재 주 미기록 상태에서 과거만 카운트)
        const isoWeek = isoWeekKey(dates[0]);

        for (const domain of opts.domains) {
            const result = await runDeterministicPasses({ dates, domain, asOf, isoWeek, store, persist: true });

            if (result.itemCount === 0) {
                stats.push({
                    isoWeek, domain, itemCount: 0, threadCount: 0, gatedCount: 0, demotedCount: 0,
                    promotedCount: 0, gradeA: 0, gradeB: 0, gradeC: 0,
                    singletonThreadCount: 0, newThreadCount: 0, matchedThreadCount: 0, m1Count: 0,
                });
                log(`${isoWeek} [${domain}] 아이템 0건 — 건너뜀`);
                continue;
            }

            const g = result.graded;
            const stat: WeekDomainStat = {
                isoWeek, domain, itemCount: result.itemCount, threadCount: g.length,
                gatedCount: g.filter(t => t.gate.hardGatePass).length,
                demotedCount: result.demoted.length,
                promotedCount: result.promoted.length,
                gradeA: result.promoted.filter(t => t.grade === 'A').length,
                gradeB: result.promoted.filter(t => t.grade === 'B').length,
                gradeC: result.promoted.filter(t => t.grade === 'C').length,
                singletonThreadCount: g.filter(t => t.members.length === 1).length,
                newThreadCount: g.filter(t => !t.matchedExisting).length,
                matchedThreadCount: g.filter(t => t.matchedExisting).length,
                m1Count: g.filter(t => t.motionTypes.includes('M1')).length,
            };
            stats.push(stat);
            if (opts.write) threadsWritten += g.length;
            log(`${isoWeek} [${domain}] items=${result.itemCount} threads=${g.length} promoted=${stat.promotedCount}(A${stat.gradeA}/B${stat.gradeB}/C${stat.gradeC}) demoted=${stat.demotedCount} matched=${stat.matchedThreadCount} m1=${stat.m1Count}`);
        }
    }

    return { stats, threadsWritten };
}
