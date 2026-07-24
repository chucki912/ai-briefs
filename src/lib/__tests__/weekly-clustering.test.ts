/** PASS 1 파싱/살균(parseAndSanitize) 순수 로직 테스트 (외부 API 불필요).
 *  npx tsx src/lib/__tests__/weekly-clustering.test.ts */
import { parseAndSanitize, toSnakeKey } from '../weekly/clustering';
import type { NormalizedItem } from '../weekly/types';

let pass = 0, fail = 0;
const chk = (name: string, cond: boolean, d?: string) => {
    if (cond) { pass++; console.log(`[PASS] ${name}`); }
    else { fail++; console.log(`[FAIL] ${name}${d ? ' — ' + d : ''}`); }
};

const items: NormalizedItem[] = [0, 1, 2].map(i => ({
    itemId: `ai:2026-07-2${i}#0`, publishedAt: `2026-07-2${i}`, domain: 'ai',
    title: `t${i}`, keyFacts: [], sourceUrls: [], publisherDomains: [],
}));
const candidateKeys = new Set(['hbm_supply_tightening']);

// toSnakeKey
chk('snakeKey: 정규화', toSnakeKey('HBM Supply!! Tightening', 0) === 'hbm_supply_tightening');
chk('snakeKey: 한글 등 → fallback', toSnakeKey('한글제목', 3) === 'thread_3');

// 정상: 기존 재사용 + 신규
const raw1 = JSON.stringify({
    threads: [
        { threadKey: 'hbm_supply_tightening', label: 'HBM', matchedExisting: true, members: [{ itemIndex: 0, industryTags: ['semiconductor'] }] },
        { threadKey: 'New Thread X', label: '신규', members: [{ itemIndex: 1, industryTags: ['ai_software'] }] },
    ],
});
const r1 = parseAndSanitize(raw1, items, candidateKeys);
chk('parse: 2 스레드', r1.assignments.length === 2);
const matched = r1.assignments.find(a => a.threadKey === 'hbm_supply_tightening');
chk('parse: 기존 키 재사용 matchedExisting=true', !!matched && matched.matchedExisting === true);
const fresh = r1.assignments.find(a => a.threadKey === 'new_thread_x');
chk('parse: 신규 키 snake화 + matchedExisting=false', !!fresh && fresh.matchedExisting === false);
chk('parse: rejected 없음', r1.rejectedTags.length === 0);

// 범위 밖 itemIndex 제거 + 자유 태그 reject
const raw2 = JSON.stringify({
    threads: [
        { threadKey: 't_a', label: 'A', members: [{ itemIndex: 99, industryTags: ['semiconductor'] }, { itemIndex: 2, industryTags: ['자유태그', 'ai_software'] }] },
    ],
});
const r2 = parseAndSanitize(raw2, items, candidateKeys);
chk('parse: 범위 밖 itemIndex 제거', r2.assignments[0].members.length === 1 && r2.assignments[0].members[0].itemId === items[2].itemId);
chk('parse: 유효 태그만 유지', r2.assignments[0].members[0].industryTags.length === 1 && r2.assignments[0].members[0].industryTags[0] === 'ai_software');
chk('parse: rejected 수집', r2.rejectedTags.includes('자유태그'));

// 동일 threadKey 병합 + 아이템 dedup
const raw3 = JSON.stringify({
    threads: [
        { threadKey: 'dup', label: 'D', members: [{ itemIndex: 0, industryTags: ['semiconductor'] }] },
        { threadKey: 'dup', label: 'D2', members: [{ itemIndex: 0, industryTags: ['ai_software'] }, { itemIndex: 1, industryTags: ['ai_software'] }] },
    ],
});
const r3 = parseAndSanitize(raw3, items, candidateKeys);
chk('parse: 동일 threadKey 병합', r3.assignments.length === 1);
chk('parse: 병합 시 아이템 dedup', r3.assignments[0].members.length === 2);

// member 0개 스레드 제거
const raw4 = JSON.stringify({ threads: [{ threadKey: 'empty', label: 'E', members: [] }] });
chk('parse: 빈 스레드 제거', parseAndSanitize(raw4, items, candidateKeys).assignments.length === 0);

// JSON 없음 → throw
chk('parse: JSON 없음 throw', (() => { try { parseAndSanitize('no json here', items, candidateKeys); return false; } catch { return true; } })());

console.log(`\n${fail === 0 ? '✅' : '❌'} weekly-clustering: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
