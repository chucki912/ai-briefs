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

// 등급은 정보 가치가 있으므로 독자용 명칭으로 번역해 노출한다(A/B/C 원문 코드 노출 금지).
const GRADE_LABEL: Record<string, string> = { A: '확립', B: '형성 중', C: '관찰 중' };
function gradeLabel(g: string): string {
    return GRADE_LABEL[g] ?? '관찰 중';
}

// 탈락 사유 — 독자 용어로 통일(게이트 기호·코드 노출 금지).
const DEMOTED_REASON_TAG: Record<string, string> = {
    single_date: '단일일 관측',
    single_publisher: '단일 출처',
    no_prior_evidence: '선행 관측 없음',
    dod_failed: '관측 근거 불충분',
};

function renderTable(t: WeeklyTable): string {
    if (!t || t.headers.length === 0 || t.rows.length === 0) return '';
    const head = `| ${t.headers.join(' | ')} |`;
    const sep = `| ${t.headers.map(() => '---').join(' | ')} |`;
    const body = t.rows.map(r => `| ${r.join(' | ')} |`).join('\n');
    const title = t.title ? `**${t.title}**\n\n` : '';
    return `${title}${head}\n${sep}\n${body}`;
}

/** 리터럴 이스케이프 개행 방어(생성 단계에서 새면 렌더가 깨지므로 최종 정규화). */
function nl(s: string): string {
    return (s ?? '').replace(/\\n/g, '\n').replace(/\\t/g, ' ');
}

/** 헤드라인 1줄: [등급] 라벨 — 정량 수치 1개(단위/규모 동반, 시점 불인정, 줄 간 중복 회피). */
function headlineLine(c: WeeklyThreadContent, used: Set<string>): string {
    const candidates = [
        ...c.metricsUsed.filter(isQuantitativeMetric),
        ...extractQuantitativeMetrics(`${c.background} ${c.mainContent}`),
    ];
    const metric = candidates.find(m => !used.has(m)) ?? candidates[0] ?? `관측 ${c.observedDates.length}일`;
    used.add(metric);
    return `- [${gradeLabel(c.grade)}] ${c.label} — ${metric}`;
}

function renderThread(c: WeeklyThreadContent, idx: number): string {
    const parts = [
        `### ${idx}. [${gradeLabel(c.grade)}] ${c.label}`,
        `\n[배경]\n${nl(c.background)}`,
        `\n[주요 내용]\n${nl(c.mainContent)}`,
        `\n[시사점]\n${nl(c.implications)}`,
    ];
    const table = renderTable(c.table);
    if (table) parts.push(`\n${table}`);
    return parts.join('\n');
}

function renderDemoted(demoted: DemotedThread[], mode: ShowDemoted): string {
    if (mode === 'off') return '';
    const header = `## 4. 관찰 중 · 트렌드 미성립 (${demoted.length}건)`;
    if (demoted.length === 0) return `${header}\n\n이번 주 관찰만 된 항목 없음`;
    // 섹션 성격 1줄 — 무엇인지(결과)를 독자 용어로 설명.
    const desc = `이번 주 관측되었으나 단일일·단일 출처로 지속성 판단이 불가한 항목`;
    const lines = demoted.map(d => {
        const tag = DEMOTED_REASON_TAG[d.reason] ?? '관측 근거 불충분';
        return mode === 'full'
            ? `- ${d.label} — [${tag}] (관측 항목 ${d.memberCount}건)`
            : `- ${d.label} — [${tag}]`;
    });
    return `${header}\n\n${desc}\n\n${lines.join('\n')}`;
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

    // 0~4 전 섹션을 매주 항상 출력한다(번호 건너뛰지 않음). 빈 섹션은 제목 유지 + 결과 1줄.
    // 방법론(왜 비었는지)이 아니라 결과(무엇이 없는지)를 쓴다.

    // 0. 헤드라인
    out.push(`\n## 0. 주간 헤드라인`);
    if (promoted.length === 0) {
        // 결론만, 방법론 금지. 0건은 3줄 규칙 예외로 1줄.
        out.push(`\n이번 주 ${domain} 도메인에서 지속적 흐름으로 볼 만한 움직임은 관측되지 않음.`);
    } else {
        if (promoted.length < 3) out.push(`\n이번 주 확립·형성 중 흐름 ${promoted.length}건.`);
        const usedMetrics = new Set<string>();
        out.push('\n' + promoted.slice(0, 3).map(c => headlineLine(c, usedMetrics)).join('\n'));
    }

    // 1. 트렌드
    out.push(`\n## 1. 트렌드`);
    if (promoted.length === 0) {
        out.push(`\n이번 주 확립된 트렌드 없음`);
    } else {
        promoted.forEach((c, i) => out.push('\n' + renderThread(c, i + 1)));
    }

    // 2. 교차 관찰 (실제 상호작용 없으면 비운다 — 억지 연결 금지)
    out.push(`\n## 2. 교차 관찰`);
    out.push(`\n이번 주 사안 간 유의미한 상호 강화·상충은 관측되지 않음.`);

    // 3. 다음 주 확인 포인트
    out.push(`\n## 3. 다음 주 확인 포인트`);
    if (promoted.length === 0) {
        out.push(`\n이번 주 검증 대상 없음`);
    } else {
        out.push('\n' + promoted.map(c =>
            `- **${c.label}**: ${c.nextWeekCheck}\n  - 확인 시점: ${c.killTrigger}`,
        ).join('\n'));
    }

    // 4. 관찰 중 · 트렌드 미성립
    const demotedBlock = renderDemoted(content.demoted, showDemoted);
    if (demotedBlock) out.push(`\n${demotedBlock}`);

    return out.join('\n');
}
