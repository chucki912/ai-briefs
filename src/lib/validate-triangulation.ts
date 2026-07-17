// Deep Dive 소스 삼각검증(Source Triangulation) 게이트 — 순수 함수, 부수효과 없음.
// 검증 원천은 Gemini googleSearch 응답의 groundingMetadata (리포트 본문 마크다운 파싱 금지).
// gemini.ts 비의존: battery-gemini.ts 등 다른 생성 경로에서도 그대로 재사용 가능.
import type { TRIANGULATION_CONFIG, SOURCE_TIERING } from './validation-config';

export interface TriangulationResult {
    pass: boolean;
    independentDomainCount: number;
    independentDomains: string[];   // 입력 소스에 없던 신규 도메인
    inputDomains: string[];         // 입력 브리프 소스의 도메인
    unresolvedChunks: number;       // title로 도메인 판별 실패한 청크 수
    totalChunks: number;            // grounding 청크 총수 — 0이면 무검색 산출(zero-grounding 판정 근거)
    excludedDenylisted: string[];   // denylist 매칭으로 독립 카운트에서 제외된 도메인 (로그 가시화)
}

// 2단 TLD(co.kr 등)에서 registrable domain을 last-2가 아닌 last-3으로 잡기 위한 최소 목록.
// 완전한 Public Suffix List가 아님 — 주요 언론 도메인 커버 목적.
const MULTI_PART_TLDS = new Set([
    'co.kr', 'or.kr', 'go.kr', 'ne.kr', 'ac.kr', 're.kr',
    'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
    'co.jp', 'ne.jp', 'or.jp',
    'com.au', 'com.cn', 'com.tw', 'com.hk', 'com.sg', 'com.br', 'co.in', 'co.nz',
]);

// hostname 문자열 → registrable domain. 도메인 형태가 아니면 null (unresolved).
// 정규화: 소문자화, www. 제거, co.kr류 2단 TLD 보정.
// (export: 출처 티어링 등에서 재사용 — 도메인 정규화의 단일 원천, 중복 구현 금지)
export function toRegistrableDomain(hostname: string): string | null {
    const host = hostname.trim().toLowerCase().replace(/^www\./, '');
    // 도메인 형태 검증: 라벨.라벨(.라벨...) 꼴, 공백·프로토콜·경로 불허
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) return null;
    const parts = host.split('.');
    // TLD는 숫자만으로 구성될 수 없음 (IP 주소 배제)
    if (/^\d+$/.test(parts[parts.length - 1])) return null;
    const lastTwo = parts.slice(-2).join('.');
    if (parts.length >= 3 && MULTI_PART_TLDS.has(lastTwo)) return parts.slice(-3).join('.');
    return lastTwo;
}

// 정상 URL → registrable domain (입력 브리프 소스용). 파싱 실패 시 null.
export function urlToRegistrableDomain(url: string): string | null {
    try {
        return toRegistrableDomain(new URL(url).hostname);
    } catch {
        return null;
    }
}

// denylist 매칭 — registrable domain 기준이라 서브도메인(www. 등)은 정규화 단계에서 이미 수렴.
// denylist 항목 자체도 정규화해 비교(단일 매칭 지점 — 하드코딩 분산 금지).
export function isDenylistedDomain(domain: string | null, denylist: readonly string[]): boolean {
    if (!domain) return false;
    return denylist.some(entry => toRegistrableDomain(entry) === domain);
}

export function validateTriangulation(
    groundingMetadata: unknown,     // Gemini 응답의 groundingMetadata
    inputSourceUrls: string[],      // issue.sources
    config: typeof TRIANGULATION_CONFIG,
    tiering?: typeof SOURCE_TIERING // 선택: denylist 도메인을 독립 카운트에서 제외 (기존 시그니처 호환)
): TriangulationResult {
    const inputDomainSet = new Set<string>();
    for (const url of inputSourceUrls) {
        const d = urlToRegistrableDomain(url);
        if (d) inputDomainSet.add(d);
    }
    const inputDomains = Array.from(inputDomainSet);

    const fail = (unresolvedChunks = 0): TriangulationResult => ({
        pass: false,
        independentDomainCount: 0,
        independentDomains: [],
        inputDomains,
        unresolvedChunks,
        totalChunks: 0,
        excludedDenylisted: [],
    });

    // groundingMetadata 부재/비객체/청크 없음 → 검색을 아예 안 한 리포트, 정의상 실패
    if (typeof groundingMetadata !== 'object' || groundingMetadata === null) return fail();
    const chunks = (groundingMetadata as { groundingChunks?: unknown }).groundingChunks;
    if (!Array.isArray(chunks) || chunks.length === 0) return fail();

    // 설계 원칙: groundingChunks[].web.uri는 Google 리다이렉트 URL이라 도메인 해석 불가 →
    // web.title(통상 도메인명)로 판별. title이 도메인 형태가 아니면 unresolved로 제외 (관대 카운트 금지).
    const excludeDenylisted = !!tiering?.EXCLUDE_DENYLISTED_FROM_TRIANGULATION;
    const independentSet = new Set<string>();
    const excludedSet = new Set<string>();
    let unresolvedChunks = 0;
    for (const chunk of chunks) {
        const title = (chunk as { web?: { title?: unknown } } | null)?.web?.title;
        const domain = typeof title === 'string' ? toRegistrableDomain(title) : null;
        if (!domain) {
            unresolvedChunks++;
            continue;
        }
        if (inputDomainSet.has(domain)) continue;
        // 애그리게이터는 '독립 출처'로 인정하지 않음 (깊이 정의의 티어 방어)
        if (excludeDenylisted && isDenylistedDomain(domain, tiering!.AGGREGATOR_DENYLIST)) {
            excludedSet.add(domain);
            continue;
        }
        independentSet.add(domain);
    }

    const independentDomains = Array.from(independentSet);
    return {
        pass: independentDomains.length >= config.MIN_INDEPENDENT_DOMAINS,
        independentDomainCount: independentDomains.length,
        independentDomains,
        inputDomains,
        unresolvedChunks,
        totalChunks: chunks.length,
        excludedDenylisted: Array.from(excludedSet),
    };
}
