/**
 * Key Insight 재생성(최대 1회) 로직 단위 테스트 — 외부 API 불필요(생성기 mock).
 *   실행: npx tsx scripts/test-key-insight-regen.ts
 */
import {
    ensureValidKeyInsight,
    KeyInsightGenerator,
    KeyInsightRegenContext,
} from '../src/lib/analyzers/key-insight';

const CTX: KeyInsightRegenContext = {
    facts: ['A사가 데이터센터 CapEx $20B 발표', '규제 초안 공개', 'GPU 클라우드 계약 체결'],
    title: '테스트 이슈',
    audience: 'Computing Infrastructure',
};

// 검증 통과하는 이상적 3단 Key Insight
const GOOD =
    'AI 경쟁은 모델 성능 중심에서 컴퓨팅 인프라·규제 표준·공급망을 함께 확보하는 생태계 경쟁으로 확장되고 있다. ' +
    '이에 따라 사업자는 규제 대응력과 연산 자원 확보 여부에 따라 비용 경쟁력이 달라질 수 있다. ' +
    '국내 기업은 단일 클라우드 의존도를 낮추고 국제 표준 참여 채널을 선제적으로 확보해야 한다.';

// 여전히 나쁜 결과(의도 단정 + 대응 없음)
const STILL_BAD = '미국은 후발주자를 제거하려 한다.';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
    if (cond) {
        pass++;
        console.log(`[PASS] ${name}`);
    } else {
        fail++;
        console.log(`[FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
    }
}

/** 호출 횟수를 세는 mock 생성기. */
function mockGen(returnValue: string | (() => string)): { gen: KeyInsightGenerator; calls: () => number } {
    let calls = 0;
    const gen: KeyInsightGenerator = async () => {
        calls++;
        return typeof returnValue === 'function' ? returnValue() : returnValue;
    };
    return { gen, calls: () => calls };
}

async function run() {
    console.log('=== Key Insight 재생성 로직 테스트 시작 ===\n');

    // 1. 정상 결과는 재생성하지 않음(생성기 호출 0회)
    {
        const { gen, calls } = mockGen(GOOD);
        const r = await ensureValidKeyInsight(GOOD, CTX, gen);
        check('정상 결과 → 재생성 안 함', !r.regenerated && r.chosen === 'first' && calls() === 0 && r.apiCalls === 0);
    }

    // 2. 빈 문자열 → 재생성, 정상 결과 채택
    {
        const { gen, calls } = mockGen(GOOD);
        const r = await ensureValidKeyInsight('', CTX, gen);
        check('빈 문자열 → 재생성 후 정상 채택', r.regenerated && r.chosen === 'regenerated' && calls() === 1 && r.finalValidation.ok, `chosen=${r.chosen}`);
    }

    // 3. 1문장 → 재생성 대상
    {
        const short = 'AI 인프라 확보가 핵심 변수로 부상하고 있다.';
        const { gen } = mockGen(GOOD);
        const r = await ensureValidKeyInsight(short, CTX, gen);
        check('1문장 → 재생성', r.regenerated && r.chosen === 'regenerated');
    }

    // 4. 5문장 → 재생성 대상
    {
        const long = '문장1이다. 문장2이다. 문장3이다. 문장4이다. 문장5이다.';
        const { gen } = mockGen(GOOD);
        const r = await ensureValidKeyInsight(long, CTX, gen);
        check('5문장 → 재생성', r.regenerated);
    }

    // 5. 의도 단정 → 재생성 대상
    {
        const bad = '미국은 규제로 후발주자를 제거하려 한다. 시장이 바뀔 수 있다. 기업은 공급망을 다변화해야 한다.';
        const { gen } = mockGen(GOOD);
        const r = await ensureValidKeyInsight(bad, CTX, gen);
        check('의도 단정 → 재생성', r.regenerated && r.firstValidation.issues.some(i => i.code === 'intent_assertion'));
    }

    // 6. 지정학 어휘 자체는 더 이상 재생성 트리거가 아님 (AX: 정규식 게이트 폐기)
    {
        const geo = '빅테크가 기술 카르텔로 패권을 장악하고 있다. 시장이 재편될 수 있다. 기업은 채널을 확보할 수 있다.';
        const { gen, calls } = mockGen(GOOD);
        const r = await ensureValidKeyInsight(geo, CTX, gen);
        check('지정학 어휘 → 재생성 안 함(AX)', !r.regenerated && calls() === 0);
    }

    // 7. 완화 없는 강한 인과 → 재생성 대상
    {
        const bad = '규제 의무화 때문에 중소 사업자의 검증 비용이 급증한다. 시장 진입 장벽이 높아진다.';
        const { gen } = mockGen(GOOD);
        const r = await ensureValidKeyInsight(bad, CTX, gen);
        check('완화 없는 강한 인과 → 재생성', r.regenerated && r.firstValidation.issues.some(i => i.code === 'unsupported_causal'));
    }

    // 8. warning만 있는 경우(문체 과장) → 재생성하지 않음
    {
        const warnOnly =
            'AI 인프라 경쟁이 생태계 경쟁으로 확장되며 초격차 국면으로 진입하고 있다. ' +
            '이에 따라 사업자의 비용 경쟁력이 달라질 수 있다. ' +
            '국내 기업은 공급망을 다변화하고 표준 참여 채널을 확보해야 한다.';
        const { gen, calls } = mockGen(GOOD);
        const r = await ensureValidKeyInsight(warnOnly, CTX, gen);
        check('warning만 → 재생성 안 함', !r.regenerated && calls() === 0 && r.firstValidation.issues.some(i => i.severity === 'warning'));
    }

    // 9. 재생성은 최대 1회만(2번째도 나빠도 생성기 1회만 호출)
    {
        const { gen, calls } = mockGen(STILL_BAD);
        await ensureValidKeyInsight('', CTX, gen);
        check('재생성 최대 1회', calls() === 1, `calls=${calls()}`);
    }

    // 10. 재생성 결과가 더 나쁘면 1차 유지(fallback)
    {
        // 1차: 완화 없는 인과(에러 1건) / 재생성 STILL_BAD: 의도단정+분량(에러 2건) → 1차 유지
        const first = '검증 의무화 때문에 중소 사업자의 인증 비용이 급증한다. 진입 장벽이 높아진다.';
        const { gen } = mockGen(STILL_BAD);
        const r = await ensureValidKeyInsight(first, CTX, gen);
        check('재생성이 더 나쁨 → 1차 fallback', r.regenerated && r.chosen === 'first' && r.insight.includes('때문에'), `chosen=${r.chosen}`);
    }

    // 11. 생성기 오류 → 프로세스 중단 없이 1차 반환
    {
        const errGen: KeyInsightGenerator = async () => {
            throw new Error('mock api failure');
        };
        const first = 'AI 인프라 확보가 핵심 변수로 부상하고 있다.'; // 1문장(에러)
        const r = await ensureValidKeyInsight(first, CTX, errGen);
        check('생성기 오류 → fallback, 예외 없음', r.regenError && r.chosen === 'first' && r.insight === first);
    }

    // 12. 재생성 결과의 라벨/따옴표 정제
    {
        const labeled = '■ Key Insight: "구조 변화가 나타나고 있다. 비용이 달라질 수 있다. 기업은 공급망을 다변화해야 한다."';
        const { gen } = mockGen(labeled);
        const r = await ensureValidKeyInsight('', CTX, gen);
        check('재생성 텍스트 정제(라벨/따옴표 제거)', !r.insight.startsWith('■') && !r.insight.startsWith('"'), `insight=${r.insight.slice(0, 20)}`);
    }

    console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
    if (fail > 0) process.exit(1);
}

run();
