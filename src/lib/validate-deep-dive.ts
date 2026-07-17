// Deep Dive 내용 게이트(판단 완결성) — 순수 함수, 부수효과 없음, gemini.ts 비의존.
// responseSchema가 '섹션 존재'를 보장해도 판단 필드(anchor·killTrigger 등)가 빈 채로
// 나오는 비대칭(3a e2e 실측)을 계산 가능한 규칙만으로 검증한다.
// 의미 정합성(단위 일치 등)은 범위 밖 — LLM 재호출 검증 규칙 금지(설계 원칙 1).
import type { DeepDiveStructured } from '@/types';
import type { CONTENT_GATE_CONFIG, SOURCE_TIERING } from './validation-config';

export interface ContentGateFailure {
    path: string;      // 예: "soWhat.action.costIfWrong"
    rule: string;      // "non_empty" | "needs_number_or_date" | "min_items" | "source_binding" | "boolean_required" | "anchor_source_binding" | "anchor_source_tier"
    detail: string;    // 사람이 읽을 실패 설명 (재생성 피드백에 그대로 사용)
}

export interface ContentGateResult {
    pass: boolean;
    failures: ContentGateFailure[];
}

// 숫자/날짜 판정 헬퍼 — 정규식은 이 한 곳에서만 정의(단일 원천).
// 날짜 표기(2026-12-31, 2026년 12월 등)는 아라비아 숫자를 반드시 포함하므로 숫자 1개 이상으로 판정.
const NUMBER_OR_DATE_PATTERN = /[0-9]/;
function hasNumberOrDate(s: string): boolean {
    return NUMBER_OR_DATE_PATTERN.test(s);
}

function isBlank(v: unknown): boolean {
    return typeof v !== 'string' || v.trim().length === 0;
}

export function validateDeepDiveContent(
    r: DeepDiveStructured,
    config: typeof CONTENT_GATE_CONFIG,
    tiering?: typeof SOURCE_TIERING // 선택: anchor 출처 티어 강제 (기존 시그니처 호환)
): ContentGateResult {
    const failures: ContentGateFailure[] = [];
    const failNonEmpty = (path: string) =>
        failures.push({ path, rule: 'non_empty', detail: '내용이 비어 있음(공백 포함) — 판단 필드는 공란 불가' });
    // non_empty 실패 시 숫자 검사는 중복 보고하지 않음(공란이 원인이므로)
    const checkNumberOrDate = (path: string, v: unknown) => {
        if (isBlank(v)) { failNonEmpty(path); return; }
        if (!hasNumberOrDate(v as string)) {
            failures.push({ path, rule: 'needs_number_or_date', detail: '아라비아 숫자 또는 날짜가 1개 이상 포함돼야 함(검증 가능한 임계·트리거)' });
        }
    };
    const checkNonEmpty = (path: string, v: unknown) => { if (isBlank(v)) failNonEmpty(path); };

    // ── non_empty: 서술·판단 공통 필수 필드 ──────────────────────────────────
    checkNonEmpty('signal', r.signal);
    checkNonEmpty('background.whyNow', r.background?.whyNow);
    checkNonEmpty('background.trajectory', r.background?.trajectory);
    checkNonEmpty('secondOrderMap.primaryShift', r.secondOrderMap?.primaryShift);
    checkNonEmpty('secondOrderMap.upstream', r.secondOrderMap?.upstream);
    checkNonEmpty('secondOrderMap.downstream', r.secondOrderMap?.downstream);
    checkNonEmpty('secondOrderMap.adjacent', r.secondOrderMap?.adjacent);
    checkNonEmpty('anchor.metric', r.anchor?.metric);
    checkNonEmpty('anchor.source', r.anchor?.source);
    checkNonEmpty('anchor.asOf', r.anchor?.asOf);
    checkNonEmpty('soWhat.ifInferenceHolds', r.soWhat?.ifInferenceHolds);
    checkNonEmpty('soWhat.unknown', r.soWhat?.unknown);

    // ── needs_number_or_date: 검증 가능한 임계·트리거 (비공란 전제) ─────────
    checkNumberOrDate('anchor.value', r.anchor?.value);
    checkNumberOrDate('anchor.flipThreshold', r.anchor?.flipThreshold);
    checkNumberOrDate('soWhat.killTrigger', r.soWhat?.killTrigger);

    // ── soWhat 조건부 완결성 (none은 합법 — D9 설계 유지) ────────────────────
    const actionType = r.soWhat?.actionType;
    if (actionType === 'act') {
        if (!r.soWhat.action) {
            failures.push({ path: 'soWhat.action', rule: 'non_empty', detail: "actionType='act'인데 action 블록이 없음" });
        } else {
            checkNonEmpty('soWhat.action.what', r.soWhat.action.what);
            checkNonEmpty('soWhat.action.costIfWrong', r.soWhat.action.costIfWrong);
            checkNonEmpty('soWhat.action.costIfMissed', r.soWhat.action.costIfMissed);
            if (typeof r.soWhat.action.reversible !== 'boolean') {
                failures.push({ path: 'soWhat.action.reversible', rule: 'boolean_required', detail: 'reversible은 boolean이어야 함' });
            }
        }
    } else if (actionType === 'observe') {
        if (!r.soWhat.observe) {
            failures.push({ path: 'soWhat.observe', rule: 'non_empty', detail: "actionType='observe'인데 observe 블록이 없음" });
        } else {
            checkNonEmpty('soWhat.observe.metric', r.soWhat.observe.metric);
            checkNonEmpty('soWhat.observe.cadence', r.soWhat.observe.cadence);
        }
    }

    // ── min_items ────────────────────────────────────────────────────────────
    const watchlist = Array.isArray(r.watchlist) ? r.watchlist : [];
    if (watchlist.length < config.MIN_WATCHLIST_ITEMS) {
        failures.push({ path: 'watchlist', rule: 'min_items', detail: `watchlist ${watchlist.length}개 < 최소 ${config.MIN_WATCHLIST_ITEMS}개` });
    }
    const devs = Array.isArray(r.keyDevelopments) ? r.keyDevelopments : [];
    if (devs.length < config.MIN_KEY_DEVELOPMENTS) {
        failures.push({ path: 'keyDevelopments', rule: 'min_items', detail: `keyDevelopments ${devs.length}개 < 최소 ${config.MIN_KEY_DEVELOPMENTS}개` });
    }
    const risks = Array.isArray(r.risks) ? r.risks : [];
    if (risks.length < config.MIN_RISKS) {
        failures.push({ path: 'risks', rule: 'min_items', detail: `risks ${risks.length}개 < 최소 ${config.MIN_RISKS}개` });
    }

    // ── watchlist 항목 완결성 (threshold·killTrigger는 수치·날짜까지 요구) ──
    watchlist.forEach((w, i) => {
        checkNonEmpty(`watchlist[${i}].indicator`, w?.indicator);
        checkNonEmpty(`watchlist[${i}].why`, w?.why);
        checkNumberOrDate(`watchlist[${i}].threshold`, w?.threshold);
        checkNumberOrDate(`watchlist[${i}].killTrigger`, w?.killTrigger);
        checkNonEmpty(`watchlist[${i}].dataSource`, w?.dataSource);
    });

    // ── anchor 결박 + 출처 티어: fact와 동일한 결박 패턴 (자유 텍스트 source가 아닌 sourceRefs 경유) ──
    const sourceRefs = Array.isArray(r.sourceRefs) ? r.sourceRefs : [];
    const refIds = new Set(sourceRefs.map(s => s.id));
    const anchorIds = Array.isArray(r.anchor?.sourceIds) ? r.anchor.sourceIds : [];
    const anchorUnknown = anchorIds.filter(id => !refIds.has(id));
    if (anchorIds.length < 1) {
        failures.push({ path: 'anchor.sourceIds', rule: 'anchor_source_binding', detail: 'anchor 수치의 출처 결박이 없음(sourceIds ≥ 1 필요)' });
    } else if (anchorUnknown.length) {
        failures.push({ path: 'anchor.sourceIds', rule: 'anchor_source_binding', detail: `sourceRefs에 없는 id 참조: ${anchorUnknown.join(', ')}` });
    } else if (tiering?.ENFORCE_ANCHOR_TIER) {
        // 결박이 유효할 때만 티어 판정 — tier는 sourceRefs 태깅(코드 결정) 결과를 신뢰
        const boundRefs = sourceRefs.filter(s => anchorIds.includes(s.id));
        const hasNonAggregator = boundRefs.some(s => s.tier !== 'aggregator');
        if (!hasNonAggregator) {
            failures.push({
                path: 'anchor.sourceIds',
                rule: 'anchor_source_tier',
                detail: 'anchor가 애그리게이터 출처에만 결박됨. 초안에서 비-애그리게이터 출처의 수치로 anchor를 교체할 것. 초안에 그런 수치가 없으면 anchor 필드를 빈 값으로 둘 것',
            });
        }
    }

    // ── fact-source 결박: 최종 상태 검증 (3a 카탈로그 폐기 로직 이후) ────────
    devs.forEach((dev, i) => {
        (Array.isArray(dev?.facts) ? dev.facts : []).forEach((fact, j) => {
            const ids = Array.isArray(fact?.sourceIds) ? fact.sourceIds : [];
            if (ids.length < 1) {
                failures.push({ path: `keyDevelopments[${i}].facts[${j}].sourceIds`, rule: 'source_binding', detail: '근거 소스 결박이 없음(sourceIds ≥ 1 필요)' });
            } else {
                const unknown = ids.filter(id => !refIds.has(id));
                if (unknown.length) {
                    failures.push({ path: `keyDevelopments[${i}].facts[${j}].sourceIds`, rule: 'source_binding', detail: `sourceRefs에 없는 id 참조: ${unknown.join(', ')}` });
                }
            }
        });
    });

    // ── risks 항목 완결성 ────────────────────────────────────────────────────
    risks.forEach((risk, i) => {
        checkNonEmpty(`risks[${i}].risk`, risk?.risk);
        checkNonEmpty(`risks[${i}].downsideCost`, risk?.downsideCost);
        checkNonEmpty(`risks[${i}].mitigation`, risk?.mitigation);
    });

    return { pass: failures.length === 0, failures };
}
