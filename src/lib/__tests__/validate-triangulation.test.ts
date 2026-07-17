/** 삼각검증 게이트 단위 테스트 (외부 API 불필요). npx tsx src/lib/__tests__/validate-triangulation.test.ts */
import { validateTriangulation } from '../validate-triangulation';
import { TRIANGULATION_CONFIG, SOURCE_TIERING } from '../validation-config';

let pass = 0, fail = 0;
const chk = (name: string, cond: boolean, d?: string) => { if (cond) { pass++; console.log(`[PASS] ${name}`); } else { fail++; console.log(`[FAIL] ${name}${d ? ' — ' + d : ''}`); } };

const MIN = TRIANGULATION_CONFIG.MIN_INDEPENDENT_DOMAINS;

// groundingChunks 픽스처: 실제 응답처럼 uri는 Google 리다이렉트 URL, 도메인 정보는 title에만 존재
const chunk = (title?: string) => ({ web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/xyz', title } });
const meta = (titles: (string | undefined)[]) => ({ groundingChunks: titles.map(chunk) });
// 신규 도메인 n개 생성 (입력 소스와 겹치지 않는 도메인)
const freshDomains = (n: number) => Array.from({ length: n }, (_, i) => `independent-outlet-${i}.com`);

const inputUrls = ['https://www.bloomberg.com/news/articles/ms-mai', 'https://bloomberg.com/news/other'];

// 1. 신규 도메인 MIN개 이상 → pass
{
    const r = validateTriangulation(meta(freshDomains(MIN)), inputUrls, TRIANGULATION_CONFIG);
    chk(`신규 도메인 ${MIN}개 → pass`, r.pass && r.independentDomainCount === MIN, JSON.stringify(r));
}

// 2. 신규 도메인 MIN-1개 → fail
{
    const r = validateTriangulation(meta(freshDomains(MIN - 1)), inputUrls, TRIANGULATION_CONFIG);
    chk(`신규 도메인 ${MIN - 1}개 → fail`, !r.pass && r.independentDomainCount === MIN - 1, JSON.stringify(r));
}

// 3. grounding 도메인 전부 입력 소스와 동일 → fail (독립성 0)
{
    const r = validateTriangulation(meta(['bloomberg.com', 'bloomberg.com', 'www.bloomberg.com', 'bloomberg.com']), inputUrls, TRIANGULATION_CONFIG);
    chk('grounding 전부 입력 도메인 재보도 → fail, 독립성 0', !r.pass && r.independentDomainCount === 0, JSON.stringify(r));
}

// 4. www. 유무만 다른 도메인 → 동일 도메인으로 카운트
{
    // 입력에 www.bloomberg.com이 있으므로 grounding의 bloomberg.com은 신규 아님.
    // 신규 쪽도 www.reuters.com과 reuters.com이 1개로 합산되어야 함.
    const r = validateTriangulation(meta(['bloomberg.com', 'www.reuters.com', 'reuters.com']), inputUrls, TRIANGULATION_CONFIG);
    chk('www. 유무만 다르면 동일 도메인', r.independentDomainCount === 1 && r.independentDomains[0] === 'reuters.com' && r.inputDomains.length === 1, JSON.stringify(r));
}

// 5. groundingMetadata 부재/빈 배열 → fail
{
    const r1 = validateTriangulation(undefined, inputUrls, TRIANGULATION_CONFIG);
    const r2 = validateTriangulation({}, inputUrls, TRIANGULATION_CONFIG);
    const r3 = validateTriangulation({ groundingChunks: [] }, inputUrls, TRIANGULATION_CONFIG);
    chk('groundingMetadata 부재 → fail', !r1.pass && r1.independentDomainCount === 0);
    chk('groundingChunks 부재 → fail', !r2.pass && r2.independentDomainCount === 0);
    chk('groundingChunks 빈 배열 → fail', !r3.pass && r3.independentDomainCount === 0);
}

// 6. title이 도메인 형태가 아닌 청크 → unresolvedChunks 증가, 카운트 제외
{
    const nonDomainTitles = ['Bloomberg - Are you a robot?', 'MS, MAI 모델 공개…', '', undefined];
    const r = validateTriangulation(meta([...nonDomainTitles, ...freshDomains(MIN - 1)]), inputUrls, TRIANGULATION_CONFIG);
    chk('비도메인 title은 unresolved로 제외(관대 카운트 금지)', !r.pass && r.unresolvedChunks === nonDomainTitles.length && r.independentDomainCount === MIN - 1, JSON.stringify(r));
}

// ── 출처 티어링 연동 (SOURCE_TIERING 전달 시) ──

// 7. denylist 도메인 → 독립 카운트 제외 + excludedDenylisted 기록
{
    const denyDomain = SOURCE_TIERING.AGGREGATOR_DENYLIST[0];
    const r = validateTriangulation(meta([denyDomain, ...freshDomains(MIN - 1)]), inputUrls, TRIANGULATION_CONFIG, SOURCE_TIERING);
    chk('denylist 도메인 독립 카운트 제외', !r.pass && r.independentDomainCount === MIN - 1 && r.excludedDenylisted.includes(denyDomain), JSON.stringify(r));
}

// 8. 서브도메인/정규화 변형(www.)도 denylist 매칭
{
    const r = validateTriangulation(meta(['www.cryptobriefing.com', ...freshDomains(MIN)]), inputUrls, TRIANGULATION_CONFIG, SOURCE_TIERING);
    chk('www. 변형 denylist 매칭', r.excludedDenylisted.includes('cryptobriefing.com') && r.independentDomainCount === MIN, JSON.stringify(r));
}

// 9. 청크 0 → totalChunks=0 (zero-grounding 판정 근거)
{
    const r1 = validateTriangulation(undefined, inputUrls, TRIANGULATION_CONFIG, SOURCE_TIERING);
    const r2 = validateTriangulation({ groundingChunks: [] }, inputUrls, TRIANGULATION_CONFIG, SOURCE_TIERING);
    const r3 = validateTriangulation(meta(freshDomains(1)), inputUrls, TRIANGULATION_CONFIG, SOURCE_TIERING);
    chk('청크 0 → totalChunks=0 (zero-grounding)', r1.totalChunks === 0 && r2.totalChunks === 0 && r3.totalChunks === 1, JSON.stringify({ r1: r1.totalChunks, r2: r2.totalChunks, r3: r3.totalChunks }));
}

// 10. tiering 미전달(기존 시그니처) → denylist 미적용 하위호환
{
    const denyDomain = SOURCE_TIERING.AGGREGATOR_DENYLIST[0];
    const r = validateTriangulation(meta([denyDomain, ...freshDomains(MIN - 1)]), inputUrls, TRIANGULATION_CONFIG);
    chk('tiering 미전달 시 denylist 미적용(호환)', r.pass && r.independentDomainCount === MIN && r.excludedDenylisted.length === 0, JSON.stringify(r));
}

console.log(`\n삼각검증 테스트: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
