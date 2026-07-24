/**
 * 주간 트렌드 파이프라인 v2 — 공통 타입 (PASS 0~2)
 *
 * PASS 0(정규화) → PASS 1(클러스터링) → PASS 2(결정론 게이트)가 주고받는 계약.
 * 게이트 판정값은 전부 코드가 확정한다(설계 원칙: LLM은 클러스터링·서술만).
 */
import type { IndustryTag } from '@/configs/industry-tags';

/** PASS 0 산출: 일일 브리핑 IssueItem을 주간 파이프라인 최소 스키마로 정규화. */
export interface NormalizedItem {
    itemId: string;            // `${domain}:${publishedAt}#${idx}` — 일자 내 안정 식별자
    publishedAt: string;       // YYYY-MM-DD (브리핑 date, battery- 접두사 제거)
    domain: 'ai' | 'battery';
    title: string;             // = IssueItem.headline
    keyFacts: string[];        // 원사실만(일일 파이프라인 판단 필드 제외)
    sourceUrls: string[];      // 원본 소스 URL
    publisherDomains: string[]; // registrable domain(정규화·alias 적용, dedup). denylist 제외는 게이트에서.
}

/** PASS 1 산출: 한 스레드에 속한 아이템 + 그 아이템에 부여된 산업 태그. */
export interface ClusterMember {
    itemId: string;
    industryTags: IndustryTag[]; // 아이템 단위 태그(M4 교차-아이템 판정 근거)
}

/** PASS 1 산출: 동일 인과 메커니즘 스레드. */
export interface ClusterAssignment {
    threadKey: string;          // 영문 스네이크케이스
    label: string;
    matchedExisting: boolean;   // 기존 threadIndex threadKey 재사용 여부
    members: ClusterMember[];
}

/** PASS 2: 코드 판정 가능한 운동유형 후보(확정은 PASS 4). M3/M5는 코드 판정 불가. */
export interface MotionCandidates {
    M1: boolean; // 지속·누적: priorWeeksInternal >= 1
    M2: boolean; // 가속·임계(후보): 서로 다른 시점에 수치 근거 존재(확정은 PASS 4)
    M4: boolean; // 확산·전이: distinct industryTags >= 2 AND 각 태그가 서로 다른 아이템에 결박
}

export type DemotedReason = 'single_date' | 'single_publisher';

/** PASS 2 산출: 스레드별 결정론 게이트 결과. */
export interface GateResult {
    threadKey: string;
    label: string;
    matchedExisting: boolean;
    observedDates: string[];      // distinct publishedAt (오름차순)
    publisherCount: number;       // distinct registrable domain(denylist 제외)
    publishers: string[];         // 위 도메인 목록
    priorWeeksInternal: number;   // threadIndex 최근 8주 관측 주차 수
    hardGatePass: boolean;        // observedDates>=2 AND publisherCount>=2
    demotedReasons: DemotedReason[];
    motionCandidates: MotionCandidates;
    industryTags: IndustryTag[];  // 스레드 태그 합집합
    memberItemIds: string[];
}
