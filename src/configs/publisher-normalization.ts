/**
 * 발행 주체(publisher) 도메인 정규화 테이블 — 주간 게이트 (b) 출처 독립성 판정용.
 *
 * 스펙 요구: "동일 통신사 전재·재게재는 1곳으로 계산되도록 도메인 정규화 테이블을 둘 것."
 *
 * 2단계로 발행 주체를 셈한다:
 *   1) registrable domain 정규화 — toRegistrableDomain(단일 원천, validate-triangulation.ts)
 *      로 서브도메인/www/2단 TLD를 수렴.
 *   2) PUBLISHER_ALIASES — 동일 발행 주체의 복수 도메인(지역판·전재 채널 등)을 대표
 *      도메인 하나로 canonical화. 여기서 합쳐지면 게이트에서 1곳으로 계산된다.
 *   3) 집계 아이템(aggregator/리라이팅)은 SOURCE_TIERING.AGGREGATOR_DENYLIST(기존 단일
 *      원천)로 독립 카운트에서 제외 — 별도 재구현 금지.
 *
 * 운영 원칙(denylist 대장 규칙과 동일 정신):
 *   - 오병합이 미병합보다 나쁘다(서로 다른 주체를 하나로 세면 트렌드가 거짓 강등된다).
 *     명백한 동일 주체만 신중히 추가하고, 근거를 주석에 남긴다.
 *   - 키/값 모두 registrable domain 형태로 적는다(정규화 후 비교).
 */

// canonical화 매핑: { 별칭 도메인 → 대표 도메인 }. 정규화된 registrable domain 기준.
// 초기값은 보수적으로 비워 둔다. 동일 주체가 실제 관측되면 근거와 함께 추가한다.
// 예시(형식 참고용, 실제 관측 전까지 미적용):
//   'reuters.co.uk': 'reuters.com',   // 로이터 지역판 → 대표
export const PUBLISHER_ALIASES: Readonly<Record<string, string>> = {
    // (관측 시 추가 — 자동 추가 금지)
};

/**
 * registrable domain을 대표 도메인으로 canonical화. alias 미등록이면 원본 그대로.
 * 입력은 이미 toRegistrableDomain을 통과한 registrable domain이어야 한다.
 */
export function canonicalizePublisher(registrableDomain: string): string {
    return PUBLISHER_ALIASES[registrableDomain] ?? registrableDomain;
}
