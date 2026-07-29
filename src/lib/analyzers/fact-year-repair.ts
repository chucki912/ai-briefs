/**
 * C19 텍스트-연도 결속 재생성/폐기.
 *
 * factAssertedAt(내부 필드)에는 "근거 없으면 unknown"이 강제되지만, 독자가 보는 것은 keyFact
 * 텍스트다. 모델이 필드에선 정직하게 unknown을 쓰고 같은 사실 서술에선 연도를 지어내면(예:
 * 2024년 사실을 "2026년 상반기"로), 독자 기준으론 아무것도 고쳐지지 않는다. 텍스트 연도를
 * 필드에 결속한다: 위반 fact는 텍스트를 1회 재생성, 그래도 위반이면 폐기.
 */
import { factTextYearViolation } from './structured-checks';
import type { KeyFactStructured } from '@/types';

export function buildFactYearRepairPrompt(text: string, value: string): string {
    const yr = value.slice(0, 4);
    const rule = value === 'unknown'
        ? '이 문장에서 연도 표기(예: "2024년", "2026")를 모두 제거하고 시점을 단정하지 않는 자연스러운 개조식 문장으로 다시 쓰라. 수치·주체·사실 내용은 그대로 유지.'
        : `이 문장이 "${yr}년" 사실임을 문장 안에 명시하고(연도가 없으면 추가), "${yr}년" 외의 다른 연도는 절대 쓰지 마라. 사실 내용·수치는 유지.`;
    return `다음 사실 문장을 규칙에 맞게 다시 쓰라. 다시 쓴 문장만 출력(설명·따옴표·접두어 금지).\n규칙: ${rule}\n문장: ${text}`;
}

/**
 * 위반 fact 텍스트를 1회 재생성하고, 재생성 후에도 위반이면 폐기(배열에서 제외).
 * @param regen 프롬프트 → 생성 텍스트 콜백(도메인별 generateWithRetry 주입)
 */
export async function repairFactYears(
    facts: KeyFactStructured[],
    regen: (prompt: string) => Promise<string>,
): Promise<KeyFactStructured[]> {
    const out: KeyFactStructured[] = [];
    for (const f of facts) {
        if (!factTextYearViolation(f)) { out.push(f); continue; }
        try {
            const raw = await regen(buildFactYearRepairPrompt(f.text, f.factAssertedAt?.value ?? 'unknown'));
            const newText = raw.trim().replace(/^["'\s]+|["'\s]+$/g, '');
            const cand = { ...f, text: newText };
            if (newText && !factTextYearViolation(cand)) { out.push(cand); continue; }
        } catch { /* 재생성 실패 → 폐기 경로 */ }
        console.warn(`[c19] fact ${f.id} 텍스트 연도 위반 — 재생성 후에도 위반 → 폐기: "${f.text.slice(0, 50)}"`);
        // 폐기(미push)
    }
    return out;
}
