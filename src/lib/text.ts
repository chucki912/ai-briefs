/**
 * 과거에 생성된 브리프 keyFacts에는 문장 끝에
 * `(Yahoo Finance, 2026년 7월 / 검증됨)`, `(... / 미검증)`,
 * `(... 기준 / 신뢰도 보통)` 같은 출처·시점·신뢰도 꼬리표가 붙어 있음.
 * 프롬프트에서 더 이상 생성하지 않지만, 이미 저장된(프로덕션 KV 등) 데이터를
 * 표시 시점에 정리하기 위해 이 꼬리표를 제거함.
 *
 * 검증됨/미검증/신뢰도 키워드를 포함한 "맨 끝 괄호"만 제거하므로,
 * `(Microsoft)`, `(한화 약 70조 원)`, `(LGES, SK On 등)` 같은 정상 괄호는 보존됨.
 */
const VERIFICATION_TAG_RE = /\s*[（(][^（()）]*(?:검증됨|미검증|신뢰도)[^（()）]*[)）]\s*$/;

export function stripVerificationTag(fact: string): string {
    if (!fact) return fact;
    return fact.replace(VERIFICATION_TAG_RE, '').trim();
}

export function cleanKeyFacts(facts: string[] | undefined | null): string[] {
    if (!facts) return [];
    return facts.map(stripVerificationTag);
}
