/** threadIndex 순수 로직 단위 테스트 (외부 API/KV 불필요).
 *  npx tsx src/lib/__tests__/thread-index.test.ts */
import {
    mergeThreadIndex,
    isoWeekKey,
    priorWeeksInternal,
    recentIsoWeekKeys,
} from '../thread-index';
import { validateIndustryTags, normalizeIndustryTag } from '../../configs/industry-tags';
import type { ThreadIndexEntry } from '../../types';

let pass = 0, fail = 0;
const chk = (name: string, cond: boolean, d?: string) => {
    if (cond) { pass++; console.log(`[PASS] ${name}`); }
    else { fail++; console.log(`[FAIL] ${name}${d ? ' — ' + d : ''}`); }
};

const base = (over: Partial<ThreadIndexEntry> = {}): ThreadIndexEntry => ({
    threadKey: 'hbm_supply_tightening',
    label: 'HBM 공급 타이트닝',
    firstObservedAt: '2026-07-01',
    lastObservedAt: '2026-07-03',
    weeklyCounts: { '2026-W27': 2 },
    representativeMetrics: ['월 14만장'],
    anchorSourceIds: ['s1'],
    domainTags: ['ai'],
    industryTags: ['semiconductor'],
    ...over,
});

// ── isoWeekKey ───────────────────────────────────────────────────────────────
chk('isoWeekKey: 형식 YYYY-Www', /^\d{4}-W\d{2}$/.test(isoWeekKey('2026-07-20')));
chk('isoWeekKey: battery- 접두사 무시', isoWeekKey('battery-2026-07-20') === isoWeekKey('2026-07-20'));
chk('isoWeekKey: 2026-01-01 → ISO 연도 롤오버', isoWeekKey('2026-01-01') === '2026-W01',
    `got ${isoWeekKey('2026-01-01')}`);
chk('isoWeekKey: 파싱 불가 throw', (() => { try { isoWeekKey('nope'); return false; } catch { return true; } })());

// ── recentIsoWeekKeys / priorWeeksInternal ──────────────────────────────────
const wk = recentIsoWeekKeys('2026-07-20', 8);
chk('recentIsoWeekKeys: 8개', wk.length === 8, `got ${wk.length}`);
chk('recentIsoWeekKeys: 기준 주 포함(최신 첫 원소)', wk[0] === isoWeekKey('2026-07-20'));
chk('recentIsoWeekKeys: 중복 없음', new Set(wk).size === 8);

const entryForWindow = base({
    weeklyCounts: {
        [isoWeekKey('2026-07-20')]: 3, // 기준 주
        [isoWeekKey('2026-07-13')]: 1, // 1주 전
        [isoWeekKey('2026-05-01')]: 9, // 창 밖(8주 초과)
        [isoWeekKey('2026-07-06')]: 0, // 0건 → 미관측 취급
    },
});
chk('priorWeeksInternal: 창 내 관측 주차만 카운트',
    priorWeeksInternal(entryForWindow, '2026-07-20', 8) === 2,
    `got ${priorWeeksInternal(entryForWindow, '2026-07-20', 8)}`);
chk('priorWeeksInternal: null 안전', priorWeeksInternal(null, '2026-07-20') === 0);
chk('priorWeeksInternal: 0건 버킷은 미관측', priorWeeksInternal(base({ weeklyCounts: { [isoWeekKey('2026-07-20')]: 0 } }), '2026-07-20') === 0);

// ── mergeThreadIndex: add-only 불변식 ────────────────────────────────────────
const existing = base({
    industryTags: ['semiconductor'],
    domainTags: ['ai'],
    representativeMetrics: ['월 14만장'],
    anchorSourceIds: ['s1'],
    weeklyCounts: { '2026-W27': 2 },
    firstObservedAt: '2026-07-01',
    lastObservedAt: '2026-07-03',
});
const incoming = base({
    label: 'HBM 공급 타이트닝(갱신)',
    industryTags: ['cloud_datacenter'],       // 신규 추가
    domainTags: ['battery'],                    // 신규 추가
    representativeMetrics: ['월 20만장'],
    anchorSourceIds: ['s2'],
    weeklyCounts: { '2026-W29': 4 },
    firstObservedAt: '2026-07-13',
    lastObservedAt: '2026-07-17',
});
const merged = mergeThreadIndex(existing, incoming);

chk('merge: industryTags 합집합(add-only)',
    merged.industryTags.length === 2 && merged.industryTags.includes('semiconductor') && merged.industryTags.includes('cloud_datacenter'),
    JSON.stringify(merged.industryTags));
chk('merge: 기존 태그 상속(삭제 불가)', merged.industryTags.includes('semiconductor'));
chk('merge: domainTags 합집합', merged.domainTags.length === 2);
chk('merge: firstObservedAt=min', merged.firstObservedAt === '2026-07-01');
chk('merge: lastObservedAt=max', merged.lastObservedAt === '2026-07-17');
chk('merge: weeklyCounts 합쳐짐', merged.weeklyCounts['2026-W27'] === 2 && merged.weeklyCounts['2026-W29'] === 4);
chk('merge: label 최신 우선', merged.label === 'HBM 공급 타이트닝(갱신)');
chk('merge: threadKey 불변', merged.threadKey === 'hbm_supply_tightening');
chk('merge: representativeMetrics 합집합', merged.representativeMetrics.includes('월 14만장') && merged.representativeMetrics.includes('월 20만장'));
chk('merge: anchorSourceIds 합집합', merged.anchorSourceIds.includes('s1') && merged.anchorSourceIds.includes('s2'));

// weeklyCounts 멱등: 같은 주 재실행이 합산되지 않고 overwrite
const reRun = mergeThreadIndex(
    base({ weeklyCounts: { '2026-W30': 3 } }),
    base({ weeklyCounts: { '2026-W30': 3 } }),
);
chk('merge: 같은 주 재실행 멱등(overwrite, 합산 아님)', reRun.weeklyCounts['2026-W30'] === 3,
    `got ${reRun.weeklyCounts['2026-W30']}`);

// 새 값으로 같은 주 재관측 시 overwrite
const reCount = mergeThreadIndex(
    base({ weeklyCounts: { '2026-W30': 3 } }),
    base({ weeklyCounts: { '2026-W30': 5 } }),
);
chk('merge: 같은 주 카운트 갱신 overwrite', reCount.weeklyCounts['2026-W30'] === 5);

// existing=null(신규 스레드)도 자체 중복 정리
const fresh = mergeThreadIndex(null, base({
    industryTags: ['semiconductor', 'semiconductor'],
    representativeMetrics: ['월 14만장', '월 14만장'],
}));
chk('merge: 신규 스레드 자체 dedup', fresh.industryTags.length === 1 && fresh.representativeMetrics.length === 1);

// ── industryTags 검증(폐쇄형) ────────────────────────────────────────────────
chk('validate: 유효 태그 통과', validateIndustryTags(['semiconductor', 'ai_software']).rejected.length === 0);
chk('validate: 자유 문자열 reject', validateIndustryTags(['자유태그', 'blockchain_web3']).rejected.length === 2);
chk('validate: 유효/무효 분리', (() => { const r = validateIndustryTags(['ai_software', 'nope']); return r.valid.length === 1 && r.rejected.length === 1; })());
chk('validate: 중복 제거', validateIndustryTags(['ai_software', 'ai_software']).valid.length === 1);
chk('normalize: 대소문자/공백 관용', normalizeIndustryTag('AI Software') === 'ai_software');
chk('normalize: 하이픈 관용', normalizeIndustryTag('cloud-datacenter') === 'cloud_datacenter');
chk('normalize: 사전 밖 → null', normalizeIndustryTag('metaverse') === null);

console.log(`\n${fail === 0 ? '✅' : '❌'} thread-index: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
