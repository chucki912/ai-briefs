/**
 * 산업 태그 — 폐쇄형(closed) enum 사전
 *
 * 용도: 주간 트렌드 파이프라인 M4(확산·전이) 판정의 결정론적 근거.
 *   M4는 "동일 메커니즘이 2개 이상의 산업에서 관측"을 요구하는데, 일일 브리핑
 *   스키마에는 domainTag가 없다(도메인은 ai/battery 이진값뿐). 따라서 PASS 1
 *   클러스터링이 각 스레드에 산업 태그를 부여하고, PASS 2 코드가 distinct 수로
 *   M4 후보를 판정한다.
 *
 * 설계 원칙(위반 금지):
 *   - 폐쇄형이다. LLM이 자유 문자열을 반환하면 reject 후 재요청한다(T3).
 *     자유 문자열을 허용하면 태그가 파편화되어 distinct 카운트가 무의미해진다.
 *   - "기타/일반" 같은 포괄 버킷을 두지 않는다. 모든 것이 그리로 몰리면 M4가 붕괴한다.
 *   - 태그는 threadIndex에 add-only로 누적된다(삭제 불가). 이 사전에서 항목을
 *     제거하면 과거 threadIndex의 태그가 검증 불능이 되므로, 항목 추가만 허용하고
 *     제거·개명은 마이그레이션을 동반해야 한다.
 */

export const INDUSTRY_TAGS = [
    'semiconductor',            // 반도체(파운드리·설계·장비·소재)
    'ai_software',              // AI/소프트웨어·모델·플랫폼
    'cloud_datacenter',         // 클라우드·데이터센터·인프라
    'consumer_electronics',     // 소비자 전자기기·디바이스
    'telecom_network',          // 통신·네트워크 장비
    'automotive_mobility',      // 자동차·모빌리티
    'battery_energy_storage',   // 배터리·에너지저장(ESS)
    'energy_utilities',         // 에너지·전력·유틸리티
    'materials_chemicals',      // 소재·화학
    'manufacturing_industrial', // 제조·산업재
    'robotics_automation',      // 로보틱스·자동화
    'healthcare_biotech',       // 헬스케어·바이오
    'financial_services',       // 금융·핀테크
    'retail_ecommerce',         // 유통·이커머스
    'media_entertainment',      // 미디어·콘텐츠
    'defense_aerospace',        // 방산·항공우주
    'public_policy_regulation', // 공공정책·규제(교차 도메인 overlay)
] as const;

export type IndustryTag = typeof INDUSTRY_TAGS[number];

/** 프롬프트 주입·렌더용 한글 라벨. 키는 enum과 1:1 유지. */
export const INDUSTRY_TAG_LABELS: Record<IndustryTag, string> = {
    semiconductor: '반도체',
    ai_software: 'AI·소프트웨어',
    cloud_datacenter: '클라우드·데이터센터',
    consumer_electronics: '소비자 전자기기',
    telecom_network: '통신·네트워크',
    automotive_mobility: '자동차·모빌리티',
    battery_energy_storage: '배터리·에너지저장',
    energy_utilities: '에너지·전력',
    materials_chemicals: '소재·화학',
    manufacturing_industrial: '제조·산업재',
    robotics_automation: '로보틱스·자동화',
    healthcare_biotech: '헬스케어·바이오',
    financial_services: '금융·핀테크',
    retail_ecommerce: '유통·이커머스',
    media_entertainment: '미디어·콘텐츠',
    defense_aerospace: '방산·항공우주',
    public_policy_regulation: '공공정책·규제',
};

const INDUSTRY_TAG_SET: ReadonlySet<string> = new Set(INDUSTRY_TAGS);

/** enum 소속 여부(타입 가드). 정규화는 하지 않는다 — 정규화는 normalizeIndustryTag 경유. */
export function isIndustryTag(value: unknown): value is IndustryTag {
    return typeof value === 'string' && INDUSTRY_TAG_SET.has(value);
}

/**
 * 입력을 enum 값으로 정규화. trim + 소문자 + 내부 공백/하이픈 → 언더스코어까지만
 * 관용한다(예: "AI Software" → "ai_software"). 그 외 매칭 실패는 null.
 * 자유 문자열을 임의 태그로 승격시키지 않는다.
 */
export function normalizeIndustryTag(raw: unknown): IndustryTag | null {
    if (typeof raw !== 'string') return null;
    const normalized = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
    return INDUSTRY_TAG_SET.has(normalized) ? (normalized as IndustryTag) : null;
}

export interface IndustryTagValidation {
    valid: IndustryTag[];       // 정규화·중복 제거된 유효 태그(입력 순서 유지)
    rejected: string[];         // enum에 없는 원본 문자열(재요청 대상)
}

/**
 * 태그 배열을 검증·정규화. 유효 태그는 중복 제거하여 valid에, 매칭 실패한
 * 원본은 rejected에 모은다. rejected가 비어 있지 않으면 호출자(PASS 1)는
 * 재요청해야 한다.
 */
export function validateIndustryTags(raw: unknown): IndustryTagValidation {
    const valid: IndustryTag[] = [];
    const rejected: string[] = [];
    const seen = new Set<IndustryTag>();

    const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
    for (const item of list) {
        const tag = normalizeIndustryTag(item);
        if (tag) {
            if (!seen.has(tag)) { seen.add(tag); valid.push(tag); }
        } else {
            rejected.push(typeof item === 'string' ? item : JSON.stringify(item));
        }
    }
    return { valid, rejected };
}
