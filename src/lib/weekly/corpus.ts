/**
 * PASS 0 — 주간 코퍼스 수집·정규화 (T2)
 *
 * 일일 브리핑(BriefReport.issues[])을 주간 파이프라인 최소 스키마로 정규화한다.
 * 설계 원칙: 일일 파이프라인의 판단 필드(insight/keyInsight/soWhat/soWhatV2/
 * oneLineSummary/singleTopicStatement/thesis)는 순환 검증 방지를 위해 제외하고
 * 원사실(headline/keyFacts/sources)만 취한다.
 *
 * 실운영/백필 공통 경로. 스토리지는 getBriefByDate(store.ts) 단일 원천을 쓴다.
 */
import type { IssueItem } from '@/types';
import type { NormalizedItem } from './types';
import { getBriefByDate } from '../store';
import { urlToRegistrableDomain } from '../validate-triangulation';
import { canonicalizePublisher } from '@/configs/publisher-normalization';

/** 일일 IssueItem → NormalizedItem. 순수 함수(부수효과 없음). */
export function normalizeIssue(
    issue: IssueItem,
    publishedAt: string,        // YYYY-MM-DD (battery- 제거된 순수 일자)
    domain: 'ai' | 'battery',
    idx: number,
): NormalizedItem {
    // 원사실만: keyFacts 우선, 없으면 structuredFacts.text
    const keyFacts = (issue.keyFacts && issue.keyFacts.length > 0)
        ? issue.keyFacts
        : (issue.structuredFacts?.map(f => f.text).filter(Boolean) ?? []);

    // 소스 URL: sourceRefs.url ∪ sources (dedup)
    const sourceUrls = Array.from(new Set([
        ...(issue.sourceRefs?.map(r => r.url) ?? []),
        ...(issue.sources ?? []),
    ].filter((u): u is string => typeof u === 'string' && u.length > 0)));

    // registrable domain 정규화 + alias canonical화 + dedup
    const publisherDomains = Array.from(new Set(
        sourceUrls
            .map(urlToRegistrableDomain)
            .filter((d): d is string => d !== null)
            .map(canonicalizePublisher),
    ));

    return {
        itemId: `${domain}:${publishedAt}#${idx}`,
        publishedAt,
        domain,
        title: issue.headline,
        keyFacts,
        sourceUrls,
        publisherDomains,
    };
}

/**
 * 주어진 일자 목록의 브리핑을 로드해 정규화한 아이템 배열을 반환.
 * 존재하지 않는 일자는 조용히 건너뛴다(90일 TTL 만료·미생성 관용).
 */
export async function collectCorpus(
    dates: string[],
    domain: 'ai' | 'battery',
): Promise<NormalizedItem[]> {
    const perDay = await Promise.all(dates.map(async (date) => {
        const storeKey = domain === 'battery' ? `battery-${date}` : date;
        const brief = await getBriefByDate(storeKey);
        if (!brief?.issues?.length) return [] as NormalizedItem[];
        return brief.issues.map((issue, idx) => normalizeIssue(issue, date, domain, idx));
    }));
    return perDay.flat();
}
