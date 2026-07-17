/** B유형 렌더러 단위 테스트 (외부 API 불필요). npx tsx src/lib/__tests__/render-deep-dive-b.test.ts
 *  serialize-deep-dive.test.ts(삭제됨)에서 이식한 단정: 판단 요소 유실 금지(soWhat/watchlist killTrigger·
 *  threshold·flipThreshold·anchor 수치), 제목·메타(관점) 존재, Sources 섹션 존재. */
import { renderDeepDiveB } from '../render-deep-dive-b';
import type { DeepDiveStructured } from '../../types';

let pass = 0, fail = 0;
const chk = (name: string, cond: boolean, d?: string) => { if (cond) { pass++; console.log(`[PASS] ${name}`); } else { fail++; console.log(`[FAIL] ${name}${d ? ' — ' + d : ''}`); } };

const fixture: DeepDiveStructured = {
    reportType: 'deep_dive',
    title: 'HBM 공급 병목의 구조 전환',
    meta: { analysisTarget: 'HBM4/SK하이닉스', audience: 'CTO·투자심사역', horizon: '2026-07-17 기준 향후 6~12개월', perspective: 'Supply Chain' },
    background: { whyNow: 'HBM4 인증 일정이 앞당겨짐', trajectory: '2023 HBM3 → 2025 HBM3E → 2026 HBM4 전환기' },
    signal: 'HBM4 선주문 물량이 전년 대비 2배 (TrendForce, 2026-06 기준)',
    anchor: {
        metric: 'HBM4 웨이퍼 캐파', value: '월 14만장', source: 'TrendForce', asOf: '2026-06',
        flipThreshold: '월 20만장 초과 시 공급과잉 반전', sourceIds: ['g1'],
    },
    keyDevelopments: [
        {
            heading: 'SK하이닉스 HBM4 조기 인증',
            facts: [
                { text: 'NVIDIA Rubin용 HBM4 인증 완료', sourceIds: ['s1'], publishedAt: '2026-07-02' },
                { text: '경쟁사 인증은 지연', sourceIds: ['x9'], publishedAt: '' }, // 카탈로그 밖 id → 출처 생략
            ],
            analysis: ['인증 선점이 물량 배분 협상력을 규정함'],
        },
        { heading: 'CapEx 상향', facts: [{ text: '패키징 증설 발표', sourceIds: ['g1'] }], analysis: ['장비 리드타임이 상한을 결정함'] },
    ],
    secondOrderMap: { primaryShift: '메모리가 배분 권력이 됨', upstream: 'TSV 장비 리드타임 연장', downstream: 'AI 서버 BOM 상승', adjacent: '전력 반도체 수요 동반 상승' },
    soWhat: {
        ifInferenceHolds: 'HBM 배분이 GPU 로드맵을 역규정함', unknown: '삼성 HBM4 인증 시점',
        actionType: 'act',
        action: { what: '공급 계약 조기 확정', reversible: false, costIfWrong: '고가 장기 계약 고착', costIfMissed: '2027 물량 배분 후순위' },
        killTrigger: '2026년 12월 31일까지 인증 벤더 3개 이상이면 논지 폐기',
    },
    risks: [{ domain: 'tech', risk: '하이브리드 본딩 수율 미달', downsideCost: '캐파 계획 20% 하향', mitigation: '수율 데이터 분기 추적' }],
    watchlist: [
        { indicator: 'HBM4 인증 벤더 수', why: '공급 독점 지속의 선행 신호', threshold: '2개 초과 시 마진 가정 재검토', killTrigger: '2026년 내 3개 도달 시 폐기', dataSource: 'TrendForce 분기 리포트' },
        { indicator: 'TSV 장비 리드타임', why: '증설 속도의 물리적 상한', threshold: '12개월 초과 시 병목 장기화', killTrigger: '6개월 미만 복귀 시 부족 논지 폐기', dataSource: 'SEMI 장비 출하 통계' },
    ],
    sourceRefs: [
        { id: 's1', url: 'https://www.reuters.com/hbm4-cert', resolved: true, tier: 'unknown' },
        { id: 'g1', url: 'https://vertexaisearch.cloud.google.com/redirect/abc', outlet: 'trendforce.com', title: 'trendforce.com', resolved: false, tier: 'unknown' },
        { id: 'g2', url: 'https://vertexaisearch.cloud.google.com/redirect/def', outlet: 'tradethepool.com', title: 'tradethepool.com', resolved: false, tier: 'aggregator' },
    ],
};
const clone = (): DeepDiveStructured => JSON.parse(JSON.stringify(fixture));
const md = renderDeepDiveB(fixture);

// 1. 4대 헤더 존재 + 순서 (indexOf 대소 비교)
const H = ['## [센싱 배경]', '## [주요 내용]', '## [논의 포인트]', '## [시사점]', '## [모니터링 지표]', '## [Sources]'];
chk('4대 헤더 + 모니터링/Sources 존재', H.every(h => md.includes(h)), md.slice(0, 200));
{
    const idx = H.map(h => md.indexOf(h));
    chk('섹션 순서 고정', idx.every((v, i) => i === 0 || v > idx[i - 1]), JSON.stringify(idx));
}

// 2. 판단 요소 유실 금지 (구 serialize 테스트에서 이식)
chk('flipThreshold 존재', md.includes(fixture.anchor.flipThreshold));
chk('soWhat.killTrigger 존재', md.includes(fixture.soWhat.killTrigger));
chk('watchlist threshold 존재', md.includes(fixture.watchlist[0].threshold));
chk('watchlist killTrigger 존재', md.includes(fixture.watchlist[0].killTrigger));
chk('watchlist dataSource 존재', md.includes(fixture.watchlist[0].dataSource));
chk('anchor 수치 존재 (이식)', md.includes(fixture.anchor.value));
chk('제목·관점 존재 (이식)', md.includes(`# ${fixture.title}`) && md.includes('Supply Chain'));

// 3. actionType 3종 분기
chk("act: 비가역·양쪽 비용 렌더", md.includes('되돌림 가능성: 비가역') && md.includes('틀렸을 때 비용: 고가 장기 계약 고착') && md.includes('안 움직였는데 맞았을 때 비용: 2027 물량 배분 후순위'));
{
    const s = clone();
    s.soWhat.actionType = 'observe';
    delete s.soWhat.action;
    s.soWhat.observe = { metric: '인증 벤더 수', cadence: '분기' };
    const m = renderDeepDiveB(s);
    chk('observe: 관측 지표/주기 렌더', m.includes('관측 지표: 인증 벤더 수 / 주기: 분기'));
}
{
    const s = clone();
    s.soWhat.actionType = 'none';
    delete s.soWhat.action;
    const m = renderDeepDiveB(s);
    chk('none: 대응 불요 문구 렌더', m.includes('현시점 대응 불요 — 판단 근거는 미확정 항목 참조'));
}

// 4. 빈 필드 줄 생략
{
    const s = clone();
    s.soWhat.action!.costIfWrong = '';
    const m = renderDeepDiveB(s);
    chk("빈 costIfWrong → '틀렸을 때 비용' 줄 생략", !m.includes('틀렸을 때 비용') && m.includes('안 움직였는데 맞았을 때 비용'));
}

// 5. sourceIds 해석: 출처 병기 + 카탈로그 밖 id 생략
chk('fact 출처 병기 (reuters.com + 발행일)', md.includes('(reuters.com, 2026-07-02)'));
chk('카탈로그 밖 id(x9)는 출처 생략', md.includes('- 경쟁사 인증은 지연\n') && !md.includes('x9'));

// 6. aggregator tier 표기
chk('애그리게이터 검증 필요 표기', md.includes('tradethepool.com — https://vertexaisearch.cloud.google.com/redirect/def (애그리게이터 — 검증 필요)'));

// 7. 구 포맷 잔재 부재
chk("구 포맷('■', [Signal]/[Anchor]) 미출현", !md.includes('■') && !md.includes('[Signal]') && !md.includes('[Anchor]'));

// 8. anchor 결박 기반 출처 표기 (마무리 패치)
{
    // 혼합 결박: 비-애그리게이터(g1)만 표기, 애그리게이터(g2)는 제외
    const s = clone();
    s.anchor.sourceIds = ['g1', 'g2'];
    const m = renderDeepDiveB(s);
    const anchorLine = m.split('\n').find(l => l.includes(s.anchor.value)) || '';
    chk('앵커 혼합 결박 → 비-애그리게이터만 표기', anchorLine.includes('trendforce.com') && !anchorLine.includes('tradethepool.com'), anchorLine);
}
{
    // 방어 케이스: 전부 애그리게이터 결박 → 결박 표기 생략, 값·원출처·기준시점은 렌더
    const s = clone();
    s.anchor.sourceIds = ['g2'];
    const m = renderDeepDiveB(s);
    const anchorLine = m.split('\n').find(l => l.includes(s.anchor.value)) || '';
    chk('앵커 전부 애그리게이터 결박 → 결박 표기 생략·값 렌더', anchorLine.includes(s.anchor.value) && anchorLine.includes('TrendForce, 2026-06') && !anchorLine.includes('tradethepool.com'), anchorLine);
}

// 9. 범위 구분자(~) 원형 보존 — 마크다운 뷰어의 single-tilde 취소선 해석과 무관하게
//    렌더러 출력 문자열 자체는 '~'를 그대로 보존해야 함 (이스케이프·치환 금지)
{
    const s = clone();
    s.keyDevelopments[0].facts[0].text = '15~20분 내 325~340km 충전(800V) 제공';
    s.watchlist[0].threshold = '팩 기준 190~210 Wh/kg 구간 진입 시 재검토';
    const m = renderDeepDiveB(s);
    chk("'15~20분 내 325~340km' 원형 보존", m.includes('15~20분 내 325~340km 충전(800V) 제공'));
    chk("threshold '190~210 Wh/kg' 원형 보존", m.includes('190~210 Wh/kg'));
    chk("'~' 이스케이프(\\~) 미발생", !m.includes('\\~'));
    const inTildes = (JSON.stringify(s).match(/~/g) || []).length;
    const outTildes = (m.match(/~/g) || []).length;
    chk('입력 대비 출력 ~ 개수 보존', outTildes === inTildes, `in=${inTildes} out=${outTildes}`);
}

console.log(`\nB유형 렌더러 테스트: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
