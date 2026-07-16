/** 구조화 카드를 사람이 판정할 수 있는 텍스트로 렌더. */
import type { IssueItem } from '@/types';
import { checkCard } from '../analyzers/structured-checks';

export function renderCard(issue: IssueItem): string {
    const L: string[] = [];
    const refById = new Map((issue.sourceRefs || []).map(s => [s.id, s]));
    L.push(`■ [${issue.category || '-'}] ${issue.headline}`);
    L.push(`  논지(thesis): ${issue.thesis || issue.oneLineSummary || '-'}`);
    L.push(`  Key Facts:`);
    (issue.structuredFacts || []).forEach((f, i) => {
        const outlets = f.sourceIds.map(id => refById.get(id)?.outlet || refById.get(id)?.url || id).join(', ') || '⚠무출처';
        L.push(`    ${i + 1}. ${f.text}  [출처: ${outlets}]${f.publishedAt ? ` (발행 ${f.publishedAt.slice(0, 10)})` : ''}`);
    });
    const ki = issue.keyInsight;
    if (ki) {
        L.push(`  ■ Key Insight (confidence=${ki.confidence}, 근거=${ki.restsOnFactIds.join(',') || '⚠없음'})`);
        L.push(`    ${ki.text}`);
        L.push(`    (지루한 대안: ${ki.mundaneAlternative || '⚠없음'})`);
    }
    const sw = issue.soWhatV2;
    if (sw) {
        L.push(`  ■ So What [actionType=${sw.actionType}]`);
        L.push(`    추론이 사실이면: ${sw.ifInferenceHolds}`);
        L.push(`    불확실: ${sw.unknown}`);
        if (sw.actionType === 'act' && sw.action) {
            L.push(`    행동: ${sw.action.what} (되돌림 ${sw.action.reversible ? 'O' : 'X'})`);
            L.push(`      틀렸을 때: ${sw.action.costIfWrong} / 놓쳤을 때: ${sw.action.costIfMissed}`);
        } else if (sw.actionType === 'observe' && sw.observe) {
            L.push(`    관측: ${sw.observe.metric} (주기 ${sw.observe.cadence})`);
        } else {
            L.push(`    (지금 실행할 행동 없음)`);
        }
        L.push(`    Kill Trigger: ${sw.killTrigger}`);
    }
    L.push(`  ■ Sources: ${(issue.sourceRefs || []).map(s => `${s.outlet || ''}${s.resolved === false ? '(미해석)' : ''}`).join(' | ') || '⚠없음'}`);
    const chk = checkCard(issue);
    L.push(`  [Check] ${chk.ok ? 'PASS' : chk.issues.map(i => i.code).join(', ')}`);
    return L.join('\n');
}
