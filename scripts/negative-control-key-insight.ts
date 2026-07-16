/**
 * Key Insight 게이트 '네거티브 컨트롤' — 게이트 recall 측정.
 *
 * 반드시 error로 걸려야 하는 위반 Key Insight를 실제 Gemini로 생성시켜, 규칙 게이트가
 * 몇 개나 잡는지(recall)와 어떤 위반이 새는지(false-negative)를 숫자로 낸다.
 * (mock 단위 테스트는 함수 동작 검증일 뿐, 게이트 성능 측정이 아님)
 *
 *   npx tsx scripts/negative-control-key-insight.ts
 *   npx tsx scripts/negative-control-key-insight.ts --repeat=3      # 표본 확대(각 유형 N회)
 *   npx tsx scripts/negative-control-key-insight.ts --no-regen      # 재생성 복구 측정 생략
 *   npx tsx scripts/negative-control-key-insight.ts --dry-run
 *
 * API 키 없으면 안내 후 정상 종료(코드 0).
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FLASH_MODEL } from '../src/lib/gemini-models';
import {
    validateKeyInsight,
    ensureValidKeyInsight,
    cleanInsightText,
    KeyInsightIssueCode,
} from '../src/lib/analyzers/key-insight';

for (const f of ['.env.local', '.env.development.local', '.env']) {
    const p = path.join(process.cwd(), f);
    if (fs.existsSync(p)) dotenv.config({ path: p });
}

interface AdversarialSpec {
    id: string;
    violation: string; //           위반 유형(설명)
    expected: KeyInsightIssueCode[]; // 걸려야 하는 error 코드(하나 이상 매칭 기대)
    prompt: string; //              위반을 유도하는 생성 프롬프트
}

// 실제 서비스 팩트를 흉내낸 중립 소재 + 특정 위반 강제
const SPECS: AdversarialSpec[] = [
    {
        id: 'intent-1',
        violation: '근거 없는 의도 단정',
        expected: ['intent_assertion'],
        prompt: '아래 사실로 Key Insight 3문장을 쓰되, 첫 문장에서 "미국 정부가 후발 AI 기업을 시장에서 제거하려 한다"처럼 특정 주체의 숨은 의도를 근거 없이 단정적으로 서술하라. 사실: AI 안전 규제 초안 공개, 검증 비용 상승 전망.',
    },
    {
        id: 'intent-2',
        violation: '의도 단정(카르텔 영속화 속셈)',
        expected: ['intent_assertion'],
        prompt: '아래 사실로 Key Insight 3문장을 쓰되, "빅테크가 기술 카르텔을 영속화하려는 속셈"이라고 단정하라. 사실: 대형 GPU 클라우드 장기계약, 오픈웨이트 모델 확산.',
    },
    // (geo-1 폐기 — AX: 지정학 수사 정규식 게이트 제거로 이 위반을 잡는 규칙이 없음. 어휘 제어는 R5 프롬프트 소관.)
    {
        id: 'geo-2',
        violation: '강한 인과(완화 없음, 퇴출 서사)',
        expected: ['unsupported_causal'],
        prompt: '아래 사실로 Key Insight 3문장을 쓰되, "규제 때문에 중소 사업자가 시장에서 완전히 퇴출된다"고 완화 표현 없이 단정하라. 사실: 고위험 AI 검증 의무화 초안.',
    },
    {
        id: 'sentence-short',
        violation: '분량 위반(1문장)',
        expected: ['sentence_count'],
        prompt: '아래 사실로 Key Insight를 정확히 한 문장으로만 써라(두 문장 이상 금지). 사실: 데이터센터 전력 수요 상향, 계통 접속 지연.',
    },
    {
        id: 'sentence-long',
        violation: '분량 위반(5문장)',
        expected: ['sentence_count'],
        prompt: '아래 사실로 Key Insight를 정확히 다섯 문장으로 길게 써라. 사실: HBM 증설, 자체 ASIC 확대, 자원국 수출규제.',
    },
    {
        id: 'causal-1',
        violation: '완화 없는 강한 인과',
        expected: ['unsupported_causal'],
        prompt: '아래 사실로 Key Insight 3문장을 쓰되, "A 때문에 B가 반드시 발생한다"처럼 직접 근거 없이 강한 인과를 단정하고 "~일 수 있다" 같은 완화 표현을 절대 쓰지 마라. 사실: 국제 표준기구 제안, 해외 클라우드 계약.',
    },
    {
        id: 'vague-1',
        violation: '추상적 대응(주시/대비로만 마무리)',
        expected: ['vague_action'],
        prompt: '아래 사실로 Key Insight 3문장을 쓰되, 마지막 문장을 "관련 기업은 이 흐름을 예의주시하고 변화에 대비해야 한다"로 끝내고 구체적 행동(확보/구축/다변화 등)은 절대 쓰지 마라. 사실: 소버린 클라우드 규제 확산.',
    },
    {
        id: 'missing-1',
        violation: '경영진 대응 부재(전망만)',
        expected: ['missing_action', 'vague_action'],
        prompt: '아래 사실로 Key Insight를 산업 전망 위주로 3문장 쓰되, 기업/경영진이 무엇을 해야 하는지 행동 제안을 전혀 넣지 말고 마지막 문장도 전망으로 끝내라. 사실: ESS 수요 확대, 화재 리스크 상존.',
    },
    {
        id: 'missing-2',
        violation: '경영진 대응 부재(서술형 종결)',
        expected: ['missing_action', 'vague_action'],
        prompt: '아래 사실로 Key Insight를 3문장 쓰되, 마지막 문장을 "시장의 불확실성이 커지는 국면이다"처럼 행동 제안 없이 상황 서술로만 끝내라. 사실: 미확인 대형 인수 보도, 회사 측 무응답.',
    },
];

function parseArgs() {
    const args = process.argv.slice(2);
    const get = (n: string) => {
        const h = args.find(a => a.startsWith(`--${n}=`));
        return h ? h.split('=')[1] : undefined;
    };
    return {
        dryRun: args.includes('--dry-run'),
        noRegen: args.includes('--no-regen'),
        repeat: get('repeat') ? Math.max(1, parseInt(get('repeat')!, 10)) : 1,
    };
}

const GEN_SUFFIX = '\n\nKey Insight 본문 텍스트만 출력하라. 제목·라벨·따옴표·설명 금지.';

async function main() {
    const { dryRun, noRegen, repeat } = parseArgs();
    const trials = SPECS.flatMap(s => Array.from({ length: repeat }, (_, i) => ({ ...s, trial: i + 1 })));

    console.log('=== Key Insight 네거티브 컨트롤 (게이트 recall 측정) ===');
    console.log(`위반 유형 ${SPECS.length}종 × repeat ${repeat} = ${trials.length}건`);
    console.log(`예상 최대 API 호출: ${trials.length * (noRegen ? 1 : 2)}회 (생성 + ${noRegen ? '재생성 생략' : '재생성 복구 확인'})\n`);

    if (dryRun) {
        SPECS.forEach(s => console.log(`  - ${s.id} [${s.violation}] 기대코드: ${s.expected.join(',')}`));
        return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.log('\n⚠️  GEMINI_API_KEY 미설정 — 실제 API 측정을 건너뜁니다(코드 0).');
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: FLASH_MODEL });
    const call = async (prompt: string) => (await (await model.generateContent(prompt)).response).text();

    let apiCalls = 0;
    let caught = 0; //          게이트가 error로 잡음(=재생성 트리거)
    let correctCode = 0; //     기대 코드까지 일치
    let recovered = 0; //       재생성으로 최종 clean
    const misses: { id: string; violation: string; insight: string; gate: string }[] = [];

    for (const t of trials) {
        try {
            const raw = await call(t.prompt + GEN_SUFFIX);
            apiCalls++;
            const insight = cleanInsightText(raw);
            const v = validateKeyInsight(insight);
            const actualCodes = v.issues.filter(i => i.severity === 'error').map(i => i.code);
            const isCaught = v.hasError;
            const codeMatch = t.expected.some(e => actualCodes.includes(e));

            if (isCaught) caught++;
            if (isCaught && codeMatch) correctCode++;
            if (!isCaught || !codeMatch) {
                misses.push({ id: `${t.id}#${t.trial}`, violation: t.violation, insight, gate: actualCodes.join(',') || 'clean' });
            }

            // 재생성 복구 측정(게이트가 잡은 건에 한해)
            let recoverTag = '';
            if (isCaught && !noRegen) {
                const ki = await ensureValidKeyInsight(insight, { facts: [], title: t.id }, call);
                apiCalls += ki.apiCalls;
                if (!ki.finalValidation.hasError) { recovered++; recoverTag = ' →복구'; }
                else recoverTag = ' →미복구';
            }

            console.log(`  ${isCaught ? (codeMatch ? '✓' : '±') : '✗'} ${t.id}#${t.trial} [${t.violation}] 게이트:${actualCodes.join(',') || 'clean'}${recoverTag}`);
        } catch (e) {
            console.error(`  ! ${t.id}#${t.trial}:`, (e as Error).message);
        }
    }

    const N = trials.length;
    console.log('\n=== 게이트 recall 집계 ===');
    console.log(JSON.stringify({
        총_위반_시도: N,
        '게이트_error_적발(recall)': `${caught}/${N} = ${Math.round((caught / N) * 100)}%`,
        '기대_코드까지_일치': `${correctCode}/${N} = ${Math.round((correctCode / N) * 100)}%`,
        '누락(false_negative)': `${N - caught}/${N} = ${Math.round(((N - caught) / N) * 100)}%`,
        '재생성_복구율': noRegen ? '측정안함' : `${recovered}/${caught || 1} = ${Math.round((recovered / (caught || 1)) * 100)}%`,
        대략적_API_호출수: apiCalls,
    }, null, 2));

    if (misses.length) {
        console.log('\n=== 누락/코드불일치 사례(게이트 개선 후보) ===');
        misses.forEach(m => {
            console.log(`\n[${m.id}] ${m.violation} — 게이트:${m.gate}`);
            console.log(`  생성문: ${m.insight}`);
        });
    } else {
        console.log('\n모든 위반 유형을 기대 코드로 적발함.');
    }

    const outDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
        path.join(outDir, 'key-insight-negative-control.json'),
        JSON.stringify({ N, caught, correctCode, recovered, misses }, null, 2),
        'utf-8',
    );
    console.log(`\n리포트 저장: reports/key-insight-negative-control.json`);
}

main().catch(e => { console.error('오류:', e); process.exit(1); });
