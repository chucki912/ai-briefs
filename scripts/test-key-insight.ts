/**
 * Key Insight 가드레일 검증 테스트 (외부 API 불필요, 순수 로직)
 *   실행: npx tsx scripts/test-key-insight.ts
 */
import { validateKeyInsight, countSentences, KeyInsightValidation } from '../src/lib/analyzers/key-insight';

interface Case {
    name: string;
    insight: string;
    expectOk: boolean;
    mustWarnInclude?: string; // 경고 메시지에 포함되어야 할 키워드
}

const cases: Case[] = [
    {
        name: '이상적인 3단 Key Insight (구조변화→영향→대응)',
        insight:
            'AI 경쟁은 모델 성능 중심에서 컴퓨팅 인프라, 규제 표준, 공급망을 함께 확보하는 생태계 경쟁으로 확장되고 있다. ' +
            '이에 따라 글로벌 AI 사업자는 규제 대응력과 안정적 연산 자원 확보 여부에 따라 시장 접근성과 비용 경쟁력이 달라질 수 있다. ' +
            '국내 기업은 단일 국가·클라우드 의존도를 줄이는 동시에 국제 표준 논의에 참여할 파트너십과 대응 체계를 선제적으로 구축해야 한다.',
        expectOk: true,
    },
    {
        name: '근거 없는 의도 단정 (제거하려 한다)',
        insight:
            '미국은 규제를 통해 후발 기업을 제거하려 한다. 이로 인해 시장 구조가 바뀐다. 기업은 대비해야 한다.',
        expectOk: false,
        mustWarnInclude: '의도 단정',
    },
    {
        name: '과장 지정학 수사 (카르텔/패권)',
        insight:
            '빅테크는 기술 카르텔을 통해 패권을 장악하고 있다. 시장은 재편될 수 있다. 기업은 옵션을 확보할 필요가 있다.',
        expectOk: false,
        mustWarnInclude: '과장',
    },
    {
        name: '분량 위반 (1문장)',
        insight: 'AI 인프라 경쟁이 심화되면서 컴퓨팅 확보가 핵심 변수로 부상하고 있다.',
        expectOk: false,
        mustWarnInclude: '분량',
    },
    {
        name: '완화 없는 강한 인과 주장',
        insight:
            '규제 강화 때문에 중소 사업자가 시장에서 사라진다. 이로 인해 대형사만 남는다. 기업은 규제 대응팀을 신설한다.',
        expectOk: false,
        mustWarnInclude: '인과',
    },
    {
        name: '빈 문자열',
        insight: '',
        expectOk: false,
    },
    // ── 네거티브 컨트롤에서 게이트가 놓쳤던 실제 누출 문장(회귀 방지) ──
    {
        name: '[누출회귀] 암묵적 의도 단정("의도적으로 기획")',
        insight:
            '미국 정부가 후발 AI 기업들을 시장에서 원천적으로 제거하고 선두 기업들의 독점 체제를 공고히 하기 위해 이번 AI 안전 규제 초안을 의도적으로 기획했습니다. ' +
            '규제안에 담긴 절차들은 신생 기업에게 진입 장벽이 될 것입니다. ' +
            '결과적으로 소수 거대 기업 중심으로 시장이 재편될 전망입니다.',
        expectOk: false,
    },
    {
        name: '[누출회귀] 연결어 없는 암묵적 인과 단정("전제로/초석")',
        insight:
            '국제 표준기구의 제안은 해외 클라우드 계약 협상에서 기술 신뢰성을 입증하는 핵심 기준이 된다. ' +
            '해외 클라우드 계약 체결은 표준기구가 요구하는 가이드라인의 준수를 전제로 진행된다. ' +
            '표준화된 국제 규격의 준수는 계약 이행 과정의 기술 장벽을 예방하는 초석이다.',
        expectOk: false,
        mustWarnInclude: '인과',
    },
    {
        name: '[누출회귀] 전망으로만 종결(경영진 대응 부재)',
        insight:
            '글로벌 친환경 에너지 전환 흐름에 따라 ESS 수요는 지속 확대될 전망입니다. ' +
            '상존하는 화재 리스크는 산업 신뢰성을 저해하는 핵심 변수가 될 것입니다. ' +
            '결국 시장은 고안전성 기술력을 확보한 상위 기업 중심으로 재편될 것으로 보입니다.',
        expectOk: false,
        mustWarnInclude: '대응',
    },
];

function run() {
    console.log('=== Key Insight 가드레일 테스트 시작 ===\n');
    let pass = 0;
    let fail = 0;

    // countSentences 단위 확인
    const sc = countSentences('첫 문장이다. 두 번째 문장이다. 세 번째 문장이다.');
    const scOk = sc === 3;
    console.log(`[${scOk ? 'PASS' : 'FAIL'}] countSentences 기본 (기대 3, 실제 ${sc})`);
    scOk ? pass++ : fail++;

    for (const c of cases) {
        const r: KeyInsightValidation = validateKeyInsight(c.insight);
        let ok = r.ok === c.expectOk;
        if (ok && c.mustWarnInclude) {
            ok = r.warnings.some(w => w.includes(c.mustWarnInclude!));
        }
        console.log(`[${ok ? 'PASS' : 'FAIL'}] ${c.name}`);
        if (!ok) {
            console.log(`      기대 ok=${c.expectOk}, 실제 ok=${r.ok}, 경고=[${r.warnings.join(' | ')}]`);
            fail++;
        } else {
            pass++;
        }
    }

    console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
    if (fail > 0) process.exit(1);
}

run();
