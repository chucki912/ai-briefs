/** T5 PASS 4-6 순수 로직 테스트 (parseBodyDraft, finalizeMotionTypes) — 외부 API 불필요.
 *  npx tsx src/lib/__tests__/weekly-report-gen.test.ts */
import { parseBodyDraft } from '../weekly/body-gen';
import { finalizeMotionTypes } from '../weekly/report-gen';
import type { MotionTypeCode } from '../weekly/grade';

let pass = 0, fail = 0;
const chk = (name: string, cond: boolean, d?: string) => {
    if (cond) { pass++; console.log(`[PASS] ${name}`); }
    else { fail++; console.log(`[FAIL] ${name}${d ? ' — ' + d : ''}`); }
};
const M = (...xs: MotionTypeCode[]) => xs;

// ── parseBodyDraft ───────────────────────────────────────────────────────────
const d1 = parseBodyDraft('본문 내용\n\n<<MOTION>>M1,M2', M('M1', 'M2', 'M4'));
chk('parseBody: 확정 파싱', JSON.stringify(d1.confirmedMotionTypes) === JSON.stringify(['M1', 'M2']));
chk('parseBody: <<MOTION>> 라인 제거', !d1.draftText.includes('<<MOTION>>') && d1.draftText === '본문 내용');
chk('parseBody: 후보 밖 태그 필터', JSON.stringify(parseBodyDraft('x\n<<MOTION>>M1,M3,M5', M('M1', 'M2')).confirmedMotionTypes) === JSON.stringify(['M1']));
chk('parseBody: 빈 확정 라인', parseBodyDraft('x\n<<MOTION>>', M('M1', 'M2')).confirmedMotionTypes.length === 0);
chk('parseBody: 라인 없으면 후보 유지(과도 하향 방지)', JSON.stringify(parseBodyDraft('본문만', M('M1', 'M4')).confirmedMotionTypes) === JSON.stringify(['M1', 'M4']));

// ── finalizeMotionTypes (M1 코드확정 유지, M2/M4는 확정분만) ──────────────────
chk('finalize: M1 후보면 확정 여부 무관 유지', JSON.stringify(finalizeMotionTypes(M('M1', 'M2'), M('M2'))) === JSON.stringify(['M1', 'M2']));
chk('finalize: M2 미확정 시 제거', JSON.stringify(finalizeMotionTypes(M('M1', 'M2', 'M4'), M('M4'))) === JSON.stringify(['M1', 'M4']));
chk('finalize: M1 미후보면 미포함', JSON.stringify(finalizeMotionTypes(M('M2', 'M4'), M('M2', 'M4'))) === JSON.stringify(['M2', 'M4']));
chk('finalize: 확정 전무면 M1만(후보였다면)', JSON.stringify(finalizeMotionTypes(M('M1', 'M2'), [])) === JSON.stringify(['M1']));
chk('finalize: M1도 M2/M4도 없으면 빈배열', finalizeMotionTypes(M('M2'), []).length === 0);

console.log(`\n${fail === 0 ? '✅' : '❌'} weekly-report-gen: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
