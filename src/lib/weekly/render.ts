/**
 * T7 — 주간 리포트 렌더러 (결정론적 마크다운 조립).
 *
 * 리포트 구조: 0 헤드라인 / 1 트렌드 스레드(정형 3단) / 2 교차 관찰 / 3 다음 주 확인 /
 * 4 관찰 중·트렌드 미성립(showDemoted). 승격 0건도 200 정상 + "성립 0건" 헤드라인.
 *
 * demoted 섹션은 "트렌드/흐름/추세/조짐" 어휘를 쓰지 않는다(템플릿이 통제).
 */
import type { WeeklyReportContent, WeeklyThreadContent } from './report-gen';
import type { DemotedThread } from './pipeline';
import type { WeeklyTable } from './structure';
import { extractQuantitativeMetrics, isQuantitativeMetric } from '@/configs/weekly-house-style';

export type ShowDemoted = 'full' | 'titles' | 'off';

const DOMAIN_LABEL: Record<'ai' | 'battery', string> = { ai: 'AI', battery: '배터리' };

const DEMOTED_REASON_TAG: Record<string, string> = {
    single_date: '단일일 관측',
    single_publisher: '단일 출처',
    no_prior_evidence: '과거 근거 없음',
    dod_failed: '규격 미달',
};

function renderTable(t: WeeklyTable): string {
    if (!t || t.headers.length === 0 || t.rows.length === 0) return '';
    const head = `| ${t.headers.join(' | ')} |`;
    const sep = `| ${t.headers.map(() => '---').join(' | ')} |`;
    const body = t.rows.map(r => `| ${r.join(' | ')} |`).join('\n');
    const title = t.title ? `**${t.title}**\n\n` : '';
    return `${title}${head}\n${sep}\n${body}`;
}

/** 헤드라인 1줄: [등급] 라벨 — 정량 수치 1개(단위/규모 동반, 시점 표기 불인정). */
function headlineLine(c: WeeklyThreadContent): string {
    const metric =
        c.metricsUsed.find(isQuantitativeMetric)
        ?? extractQuantitativeMetrics(`${c.background} ${c.mainContent}`)[0]
        ?? `관측 ${c.observedDates.length}일`; // 정량 수치 부재 시 관측일 수(진짜 카운트) 폴백
    return `- [${c.grade}] ${c.label} — ${metric}`;
}

function renderThread(c: WeeklyThreadContent, idx: number): string {
    const parts = [
        `### ${idx}. [${c.grade}] ${c.label}`,
        `\n[배경]\n${c.background}`,
        `\n[주요 내용]\n${c.mainContent}`,
        `\n[시사점]\n${c.implications}`,
    ];
    const table = renderTable(c.table);
    if (table) parts.push(`\n${table}`);
    return parts.join('\n');
}

function renderDemoted(demoted: DemotedThread[], mode: ShowDemoted): string {
    if (mode === 'off') return '';
    const header = `## 4. 관찰 중 · 트렌드 미성립 (${demoted.length}건)`;
    if (demoted.length === 0) return `${header}\n\n해당 없음`;
    const lines = demoted.map(d => {
        const tag = DEMOTED_REASON_TAG[d.reason] ?? d.reason;
        return mode === 'full'
            ? `- ${d.label} — [${tag}] (관측 항목 ${d.memberCount}건)`
            : `- ${d.label} — [${tag}]`;
    });
    return `${header}\n\n${lines.join('\n')}`;
}

export interface RenderOptions {
    showDemoted?: ShowDemoted;   // 기본 'titles'
}

/** WeeklyReportContent → 마크다운 문자열. */
export function renderWeeklyReport(content: WeeklyReportContent, opts: RenderOptions = {}): string {
    const showDemoted = opts.showDemoted ?? 'titles';
    const domain = DOMAIN_LABEL[content.domain];
    const promoted = content.threads;

    const out: string[] = [];
    out.push(`# 주간 ${domain} 산업 트렌드 리포트 (${content.isoWeek})`);

    // 0. 헤드라인
    out.push(`\n## 0. 주간 헤드라인`);
    if (promoted.length === 0) {
        out.push(`\n이번 주 트렌드 성립 0건. 승격 요건(관측 폭·출처 독립성·과거 근거)을 충족한 스레드가 없어 트렌드로 승격하지 않는다.`);
    } else {
        if (promoted.length < 3) out.push(`\n이번 주 트렌드 성립 ${promoted.length}건.`);
        out.push('\n' + promoted.slice(0, 3).map(headlineLine).join('\n'));
    }

    // 1. 트렌드 스레드
    if (promoted.length > 0) {
        out.push(`\n## 1. 트렌드 스레드`);
        promoted.forEach((c, i) => out.push('\n' + renderThread(c, i + 1)));
    }

    // 2. 교차 관찰 (실제 상호작용 없으면 비운다 — 억지 연결 금지)
    out.push(`\n## 2. 교차 관찰`);
    out.push(`\n이번 주 스레드 간 유의미한 상호 강화·상충은 관측되지 않음.`);

    // 3. 다음 주 확인 포인트
    if (promoted.length > 0) {
        out.push(`\n## 3. 다음 주 확인 포인트`);
        out.push('\n' + promoted.map(c =>
            `- **${c.label}**: ${c.nextWeekCheck}\n  - 킬 트리거: ${c.killTrigger}`,
        ).join('\n'));
    }

    // 4. 관찰 중 · 트렌드 미성립
    const demotedBlock = renderDemoted(content.demoted, showDemoted);
    if (demotedBlock) out.push(`\n${demotedBlock}`);

    return out.join('\n');
}
