/**
 * Key Insight 품질 평가 — 실제 '프로덕션 생성 경로'(generateIssueFromCluster) 사용.
 *
 *   npx tsx scripts/evaluate-key-insight.ts --dry-run
 *   npx tsx scripts/evaluate-key-insight.ts --limit=5
 *   npx tsx scripts/evaluate-key-insight.ts --limit=30 --category=ai-regulation
 *
 * 이 스크립트는 별도 축약 프롬프트가 아니라 실제 카드 생성에 쓰이는 프롬프트/스키마/재생성 로직을
 * 그대로 태워서 측정한다(문체·규칙이 실제 카드와 동일). 측정 항목:
 *   - 1차 게이트 통과/에러, 재생성/해소
 *   - LLM 심사 5항목(structure/evidence/causal/action/style)
 *   - False-Negative율: LLM이 warning/fail 준 1차 insight 중 규칙이 error로 못 잡은 비율
 *
 * API 키(GEMINI_API_KEY) 없으면 안내 후 정상 종료(코드 0). dry-run/타입검사는 키 없이 가능.
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FLASH_MODEL } from '../src/lib/gemini-models';
import { generateIssueFromCluster } from '../src/lib/gemini';
import { validateKeyInsight, KeyInsightValidation, ValidatedKeyInsightResult } from '../src/lib/analyzers/key-insight';
import { NewsItem } from '../src/types';

for (const f of ['.env.local', '.env.development.local', '.env']) {
    const p = path.join(process.cwd(), f);
    if (fs.existsSync(p)) dotenv.config({ path: p });
}

interface EvalCase {
    id: string;
    category: string;
    title: string;
    facts: string[];
    expectedAudience?: string;
}
type Verdict = 'pass' | 'warning' | 'fail';
type OverallVerdict = Verdict | 'manualReviewRequired';
interface JudgeResult {
    structure: Verdict;
    evidence: Verdict;
    causal: Verdict;
    action: Verdict;
    style: Verdict;
    notes?: string;
}
interface CaseReport {
    id: string;
    category: string;
    title: string;
    firstInsight: string;
    firstGateError: boolean;
    firstIssues: string[];
    regenerated: boolean;
    chosen: 'first' | 'regenerated';
    finalInsight: string;
    finalGateError: boolean;
    judgeFirst?: JudgeResult;
    overallFirst: OverallVerdict;
    falseNegative: boolean; // 심사 나쁨(warn/fail) & 게이트 통과
    apiCalls: number;
}

function parseArgs() {
    const args = process.argv.slice(2);
    const get = (n: string) => {
        const h = args.find(a => a.startsWith(`--${n}=`));
        return h ? h.split('=')[1] : undefined;
    };
    return {
        dryRun: args.includes('--dry-run'),
        limit: get('limit') ? Math.max(1, parseInt(get('limit')!, 10)) : 10,
        category: get('category'),
    };
}

function buildCluster(c: EvalCase): NewsItem[] {
    const base = { source: 'eval-fixture', publishedAt: new Date(0), category: c.category };
    const primary: NewsItem = { id: `${c.id}-0`, title: c.title, description: c.facts.join('. '), url: `https://example.com/${c.id}/0`, ...base };
    const rest: NewsItem[] = c.facts.map((f, i) => ({ id: `${c.id}-${i + 1}`, title: f, description: f, url: `https://example.com/${c.id}/${i + 1}`, ...base }));
    return [primary, ...rest];
}

function buildJudgePrompt(c: EvalCase, insight: string): string {
    return `아래 '확인된 사실'과 그로부터 작성된 'Key Insight'를 평가하세요.

[확인된 사실]
${c.facts.map(f => `- ${f}`).join('\n')}

[Key Insight]
${insight}

다음 5개 항목을 각각 "pass" / "warning" / "fail" 로 평가하세요.
1. structure: [산업 구조적 변화 → 기업 영향 → 경영진 대응] 3요소가 논리적 순서로 포함되었는가
2. evidence: 사실에 없는 의도·사실을 지어내지 않고 근거보다 과한 결론을 내리지 않았는가
3. causal: 직접 근거 없는 사건을 원인-결과로 단정하지 않고, 간접/병렬 신호는 구조 변화 수준에서만 통합했는가
4. action: 경영진/기업이 무엇을 할지 구체적인가(단순 "주시/대비"로 끝나지 않는가)
5. style: 2~3문장이며 과장된 지정학 표현 없이 전략 보고서 문체인가

아래 JSON만 출력(코드펜스·설명 금지):
{"structure":"pass|warning|fail","evidence":"pass|warning|fail","causal":"pass|warning|fail","action":"pass|warning|fail","style":"pass|warning|fail","notes":"짧은 근거"}`;
}

function normVerdict(v: unknown): Verdict {
    const s = String(v || '').toLowerCase();
    return s === 'pass' || s === 'warning' || s === 'fail' ? s : 'warning';
}
function combine(j: JudgeResult): OverallVerdict {
    const vals = [j.structure, j.evidence, j.causal, j.action, j.style];
    if (vals.includes('fail')) return 'fail';
    if (vals.includes('warning')) return 'warning';
    return 'pass';
}
const codes = (v: KeyInsightValidation) => v.issues.map(i => `${i.code}:${i.severity}`);

async function main() {
    const { dryRun, limit, category } = parseArgs();
    const fixturesPath = path.join(__dirname, 'fixtures', 'key-insight-cases.json');
    const all: EvalCase[] = JSON.parse(fs.readFileSync(fixturesPath, 'utf-8'));
    let cases = category ? all.filter(c => c.category === category) : all;
    cases = cases.slice(0, limit);

    console.log('=== Key Insight 평가 (프로덕션 생성 경로) ===');
    console.log(`fixture ${all.length}건 / 필터 후 ${cases.length}건 / limit=${limit}`);
    console.log(`예상 최대 API 호출: ${cases.length * 3}회 (프로덕션 생성 + 최대1회 재생성 + LLM 심사)\n`);

    if (dryRun) {
        console.log('[dry-run] 실제 호출 없이 대상만 출력:');
        cases.forEach((c, i) => console.log(`  ${i + 1}. [${c.category}] ${c.id} — ${c.title}`));
        return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.log('\n⚠️  GEMINI_API_KEY 미설정 — 실제 API 평가를 건너뜁니다(코드 0).');
        console.log('    (단위 테스트/타입 검사/--dry-run 은 키 없이 실행 가능)');
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: FLASH_MODEL });
    const judge = async (prompt: string) => (await (await model.generateContent(prompt)).response).text();

    let totalApiCalls = 0;
    const reports: CaseReport[] = [];

    for (const c of cases) {
        try {
            let ki: ValidatedKeyInsightResult | undefined;
            // 프로덕션 생성 경로 그대로 사용(동일 프롬프트/스키마/재생성). 훅으로 1차/최종 캡처.
            const issue = await generateIssueFromCluster(model, buildCluster(c), [], r => (ki = r));
            const genCalls = 1 + (ki?.apiCalls ?? 0);
            totalApiCalls += genCalls;

            if (!issue || !ki) {
                reports.push({
                    id: c.id, category: c.category, title: c.title,
                    firstInsight: '', firstGateError: true, firstIssues: ['generation_failed'],
                    regenerated: false, chosen: 'first', finalInsight: '', finalGateError: true,
                    overallFirst: 'manualReviewRequired', falseNegative: false, apiCalls: genCalls,
                });
                console.log(`  ⚠ ${c.id} 생성 실패(파싱/응답)`);
                continue;
            }

            // LLM 심사는 게이트가 본 1차 insight 기준(False-Negative 측정용)
            let judgeFirst: JudgeResult | undefined;
            let overallFirst: OverallVerdict = 'manualReviewRequired';
            try {
                const raw = await judge(buildJudgePrompt(c, ki.firstInsight));
                totalApiCalls++;
                const m = raw.match(/\{[\s\S]*\}/);
                if (m) {
                    const p = JSON.parse(m[0]);
                    judgeFirst = { structure: normVerdict(p.structure), evidence: normVerdict(p.evidence), causal: normVerdict(p.causal), action: normVerdict(p.action), style: normVerdict(p.style), notes: p.notes ? String(p.notes).slice(0, 200) : undefined };
                    overallFirst = combine(judgeFirst);
                }
            } catch { overallFirst = 'manualReviewRequired'; }

            const firstGateError = ki.firstValidation.hasError;
            const judgeBad = overallFirst === 'warning' || overallFirst === 'fail';
            const falseNegative = judgeBad && !firstGateError;

            reports.push({
                id: c.id, category: c.category, title: c.title,
                firstInsight: ki.firstInsight, firstGateError, firstIssues: codes(ki.firstValidation),
                regenerated: ki.regenerated, chosen: ki.chosen,
                finalInsight: ki.insight, finalGateError: ki.finalValidation.hasError,
                judgeFirst, overallFirst, falseNegative,
                apiCalls: genCalls + (judgeFirst ? 1 : 0),
            });
            console.log(`  ✓ ${c.id} [1차 심사:${overallFirst}] 게이트:${firstGateError ? 'ERROR' : 'clean'}${ki.regenerated ? ' (재생성)' : ''}${falseNegative ? ' ⚠FN' : ''}`);
        } catch (e) {
            console.error(`  ✗ ${c.id}:`, (e as Error).message);
        }
    }

    // ── 집계 ──
    const N = reports.length;
    const firstClean = reports.filter(r => !r.firstGateError).length;
    const firstError = reports.filter(r => r.firstGateError).length;
    const regen = reports.filter(r => r.regenerated).length;
    const finalError = reports.filter(r => r.finalGateError).length;

    const judged = reports.filter(r => r.judgeFirst);
    const judgeBad = judged.filter(r => r.overallFirst === 'warning' || r.overallFirst === 'fail');
    const fnCount = reports.filter(r => r.falseNegative).length;
    const falseNegativeRate = judgeBad.length ? fnCount / judgeBad.length : 0;
    const failRate = (k: keyof JudgeResult) => (judged.length ? Math.round((judged.filter(r => r.judgeFirst![k] === 'fail').length / judged.length) * 100) : 0);

    const summary = {
        총_평가_건수: N,
        '1차_게이트_통과': firstClean,
        '1차_게이트_에러(재생성유발)': firstError,
        재생성_실행: regen,
        '최종_게이트_에러(잔존)': finalError,
        'LLM_1차_pass': judged.filter(r => r.overallFirst === 'pass').length,
        'LLM_1차_warning': judged.filter(r => r.overallFirst === 'warning').length,
        'LLM_1차_fail': judged.filter(r => r.overallFirst === 'fail').length,
        LLM_수동검토: reports.filter(r => r.overallFirst === 'manualReviewRequired').length,
        'False_Negative_건수(심사나쁨&게이트통과)': fnCount,
        'False_Negative_분모(심사 warn/fail)': judgeBad.length,
        'False_Negative_율_percent': Math.round(falseNegativeRate * 100),
        항목별_fail율_percent: { structure: failRate('structure'), evidence: failRate('evidence'), causal: failRate('causal'), action: failRate('action'), style: failRate('style') },
        대략적_API_호출수: totalApiCalls,
    };
    console.log('\n=== 집계(프로덕션 프롬프트) ===');
    console.log(JSON.stringify(summary, null, 2));

    // False-Negative 및 재생성 사례 상세
    const notable = reports.filter(r => r.falseNegative || r.regenerated || r.overallFirst === 'fail');
    if (notable.length) {
        console.log('\n=== 주요 사례(FN/재생성/fail) ===');
        for (const r of notable) {
            console.log(`\n[${r.id}] ${r.title}`);
            console.log(`  1차 insight: ${r.firstInsight}`);
            console.log(`  게이트: ${r.firstGateError ? r.firstIssues.join(',') : 'clean'} / LLM 1차: ${r.overallFirst}${r.judgeFirst ? ` ${JSON.stringify(r.judgeFirst)}` : ''}`);
            console.log(`  재생성: ${r.regenerated ? `예(${r.chosen})` : '아니오'} / 최종 insight: ${r.finalInsight}`);
            if (r.falseNegative) console.log('  ⚠ FALSE NEGATIVE: LLM은 문제라 봤으나 규칙 게이트가 통과시킴');
        }
    }

    const outDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'key-insight-evaluation.json');
    fs.writeFileSync(outPath, JSON.stringify({ note: '프로덕션 생성 경로 사용', summary, cases: reports }, null, 2), 'utf-8');
    console.log(`\n리포트 저장: ${path.relative(process.cwd(), outPath)}`);
    console.log(`False-Negative율 요약: ${fnCount}/${judgeBad.length} = ${Math.round(falseNegativeRate * 100)}% (LLM이 문제로 본 1차 결과 중 게이트가 놓친 비율)`);
}

main().catch(e => { console.error('평가 오류:', e); process.exit(1); });
