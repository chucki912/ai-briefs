/**
 * B유형(헤더 구획 표준형) 렌더러 — serialize-deep-dive(임시 자리표시자)의 교체물.
 * 골격: [센싱 배경] → [주요 내용] → [논의 포인트] → [시사점] → [모니터링 지표] → [Sources].
 *
 * 결정론적 순수 함수: JSON 필드를 배치·포맷만 함. 텍스트 생성·요약·변형 금지, LLM 호출 금지.
 * 개조식 종결(~함/~임)은 생성 계층(pass 2 프롬프트) 책임 — 렌더러는 받은 텍스트를 신뢰함.
 * 판단 요소(flipThreshold·killTrigger·threshold·dataSource)는 유실 없이 배치 (유보 톤 방지).
 * 강조는 마크다운 볼드까지만 (밑줄·형광 위계는 프론트 HTML 지원 시 별도 태스크).
 */
import { DeepDiveStructured, SourceRef } from '@/types';

const isBlank = (s?: string): boolean => !s || !s.trim();

// 표시용 출처 라벨: outlet 우선, 없으면 URL 도메인(표시 목적의 단순 hostname — 판정 로직 아님)
function displaySource(ref: SourceRef): string | null {
    if (!isBlank(ref.outlet)) return ref.outlet!.trim();
    try {
        return new URL(ref.url).hostname.replace(/^www\./, '');
    } catch {
        return null;
    }
}

// fact 뒤 결박 출처 괄호 병기: (outlet 또는 도메인, publishedAt). 해석 불가 id는 생략.
function factSourceSuffix(sourceIds: string[], publishedAt: string | undefined, refById: Map<string, SourceRef>): string {
    const labels = sourceIds
        .map(id => refById.get(id))
        .filter((r): r is SourceRef => !!r)
        .map(displaySource)
        .filter((l): l is string => !!l);
    if (!labels.length && isBlank(publishedAt)) return '';
    const parts = [...labels];
    if (!isBlank(publishedAt)) parts.push(publishedAt!.trim());
    return parts.length ? ` (${parts.join(', ')})` : '';
}

export function renderDeepDiveB(r: DeepDiveStructured): string {
    const out: string[] = [];
    // 빈 값이면 줄 자체를 생략 (tag 모드 미달 산출물이 "빈 라벨: "로 렌더되지 않도록)
    const push = (line: string, value?: string) => {
        if (value === undefined) { out.push(line); return; }
        if (!isBlank(value)) out.push(line);
    };
    const refById = new Map((r.sourceRefs || []).map(s => [s.id, s]));

    // ── 제목 + 메타 1줄 ──
    out.push(`# ${r.title}`);
    const meta = [r.meta?.analysisTarget, r.meta?.audience, r.meta?.horizon, r.meta?.perspective]
        .filter(v => !isBlank(v)) as string[];
    if (meta.length) out.push('', meta.join(' · '));

    // ── [센싱 배경] ── (signal은 리드 굵은 불릿으로 섹션 마지막)
    out.push('', '## [센싱 배경]');
    push(`- ${r.background?.whyNow}`, r.background?.whyNow);
    push(`- 궤적: ${r.background?.trajectory}`, r.background?.trajectory);
    push(`- **${r.signal}**`, r.signal);

    // ── [주요 내용] ── 굵은 소주제 + facts(출처 병기) + analysis(한 단 더 들여쓰기)
    out.push('', '## [주요 내용]');
    for (const dev of r.keyDevelopments || []) {
        push(`- **${dev.heading}**`, dev.heading);
        for (const fact of dev.facts || []) {
            if (isBlank(fact.text)) continue;
            out.push(`  - ${fact.text}${factSourceSuffix(fact.sourceIds || [], fact.publishedAt, refById)}`);
        }
        for (const a of dev.analysis || []) {
            push(`    - ${a}`, a);
        }
    }

    // ── [논의 포인트] ── 번호 논점
    out.push('', '## [논의 포인트]');
    out.push('- **① 정량 앵커**');
    if (!isBlank(r.anchor?.value)) {
        // 출처 표기는 fact와 동일하게 sourceIds 결박 해석 — 단 애그리게이터 결박은 표기 제외.
        // (전부 애그리게이터인 경우는 anchor_source_tier 게이트가 차단하므로 통과 산출물에선 도달 불가 —
        //  방어적으로 그 경우엔 결박 표기만 생략하고 값·원출처·기준시점은 렌더)
        const bindingLabels = [...new Set(
            (r.anchor.sourceIds || [])
                .map(id => refById.get(id))
                .filter((ref): ref is SourceRef => !!ref && ref.tier !== 'aggregator')
                .map(displaySource)
                .filter((l): l is string => !!l)
        )];
        const attribution = [r.anchor.source, ...bindingLabels, r.anchor.asOf]
            .filter((v): v is string => !isBlank(v)).join(', ');
        const head = isBlank(r.anchor.metric) ? r.anchor.value : `${r.anchor.metric}: ${r.anchor.value}`;
        out.push(`  - ${head}${attribution ? ` (${attribution})` : ''}`);
    }
    push(`  - 판단 반전 임계: ${r.anchor?.flipThreshold}`, r.anchor?.flipThreshold);
    out.push('- **② 구조 변화**');
    push(`  - ${r.secondOrderMap?.primaryShift}`, r.secondOrderMap?.primaryShift);
    out.push('- **③ 파급 경로**');
    push(`  - 후방: ${r.secondOrderMap?.upstream}`, r.secondOrderMap?.upstream);
    push(`  - 전방: ${r.secondOrderMap?.downstream}`, r.secondOrderMap?.downstream);
    push(`  - 인접: ${r.secondOrderMap?.adjacent}`, r.secondOrderMap?.adjacent);

    // ── [시사점] ── soWhatV2의 위기/기회/대응 분해 + 판단 폐기 조건(유보 톤 방지의 핵심)
    out.push('', '## [시사점]');
    const sw = r.soWhat;
    push(`- **변화 (추론이 유효할 때)**: ${sw?.ifInferenceHolds}`, sw?.ifInferenceHolds);
    push(`- **미확정**: ${sw?.unknown}`, sw?.unknown);
    if (sw?.actionType === 'act' && sw.action) {
        push(`- **대응**: ${sw.action.what}`, sw.action.what);
        if (typeof sw.action.reversible === 'boolean') {
            out.push(`  - 되돌림 가능성: ${sw.action.reversible ? '가역' : '비가역'}`);
        }
        push(`  - 틀렸을 때 비용: ${sw.action.costIfWrong}`, sw.action.costIfWrong);
        push(`  - 안 움직였는데 맞았을 때 비용: ${sw.action.costIfMissed}`, sw.action.costIfMissed);
    } else if (sw?.actionType === 'observe' && sw.observe) {
        const cadence = isBlank(sw.observe.cadence) ? '' : ` / 주기: ${sw.observe.cadence}`;
        push(`- **대응**: 관측 지표: ${sw.observe.metric}${cadence}`, sw.observe.metric);
    } else if (sw?.actionType === 'none') {
        out.push('- **대응**: 현시점 대응 불요 — 판단 근거는 미확정 항목 참조');
    }
    push(`- **판단 폐기 조건**: ${sw?.killTrigger}`, sw?.killTrigger);
    const domainLabel: Record<string, string> = { tech: '기술', market: '시장', reg: '규제' };
    for (const risk of r.risks || []) {
        if (isBlank(risk.risk)) continue;
        const segs = [`리스크(${domainLabel[risk.domain] || risk.domain}): ${risk.risk}`];
        if (!isBlank(risk.downsideCost)) segs.push(`하방 비용: ${risk.downsideCost}`);
        if (!isBlank(risk.mitigation)) segs.push(`완화: ${risk.mitigation}`);
        out.push(`- ${segs.join(' / ')}`);
    }

    // ── [모니터링 지표] ──
    out.push('', '## [모니터링 지표]');
    for (const w of r.watchlist || []) {
        push(`- **${w.indicator}**`, w.indicator);
        push(`  - ${w.why}`, w.why);
        push(`  - 피보팅 기준: ${w.threshold}`, w.threshold);
        push(`  - 폐기 트리거: ${w.killTrigger}`, w.killTrigger);
        push(`  - 관측처: ${w.dataSource}`, w.dataSource);
    }

    // ── [Sources] ──
    out.push('', '## [Sources]');
    (r.sourceRefs || []).forEach((ref, i) => {
        const label = displaySource(ref);
        const aggregatorMark = ref.tier === 'aggregator' ? ' (애그리게이터 — 검증 필요)' : '';
        if (ref.resolved === false) {
            // 미해석 소스: 리다이렉트 원문 URL 출력 금지 — 도메인 힌트만 표기 (R4)
            out.push(`${i + 1}. (원문 링크 미해석 — 도메인: ${label || '불명'})${aggregatorMark}`);
        } else {
            out.push(`${i + 1}. ${label ? `${label} — ` : ''}${ref.url}${aggregatorMark}`);
        }
    });

    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
