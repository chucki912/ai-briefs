import Parser from 'rss-parser';
import { NewsItem } from '@/types';
import {
    RSS_FEEDS,
    PRIMARY_KEYWORDS,
    getGoogleNewsRssUrl,
    EXCLUDE_RULES,
    getSourceScore
} from './source-config';

const parser = new Parser({
    timeout: 10000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AIBriefBot/1.0)',
    },
});

// 뉴스 수집 메인 함수
export async function fetchAllNews(): Promise<NewsItem[]> {
    const allNews: NewsItem[] = [];

    // 1. RSS 피드에서 뉴스 수집
    const rssFeedNews = await fetchFromRssFeeds();
    allNews.push(...rssFeedNews);

    // 2. Google News에서 주요 키워드 검색
    const googleNews = await fetchFromGoogleNews();
    allNews.push(...googleNews);

    // 3. 중복 제거 및 필터링
    const filteredNews = filterAndDeduplicate(allNews);

    // 4. 점수 기반 정렬
    const sortedNews = sortByRelevance(filteredNews);

    console.log(`[NewsCollector] 총 ${sortedNews.length}개 뉴스 수집 완료`);

    return sortedNews;
}

// RSS 피드에서 뉴스 수집
async function fetchFromRssFeeds(): Promise<NewsItem[]> {
    const news: NewsItem[] = [];
    const allFeeds = [
        ...RSS_FEEDS.TIER_1,
        ...RSS_FEEDS.TIER_2,
        ...RSS_FEEDS.TIER_3,
    ];

    for (const feed of allFeeds) {
        try {
            const feedData = await parser.parseURL(feed.url);

            for (const item of feedData.items.slice(0, 10)) {
                if (item.title && item.link) {
                    news.push({
                        id: generateId(item.link),
                        title: item.title,
                        description: item.contentSnippet || item.content || '',
                        url: item.link,
                        source: feed.name,
                        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
                    });
                }
            }

            console.log(`[RSS] ${feed.name}: ${feedData.items.length}개 항목`);
        } catch (error) {
            console.error(`[RSS Error] ${feed.name}:`, error);
        }
    }

    return news;
}

// Google News에서 키워드 검색
async function fetchFromGoogleNews(): Promise<NewsItem[]> {
    const news: NewsItem[] = [];

    // 주요 키워드 5개만 검색 (API 호출 제한)
    const searchKeywords = PRIMARY_KEYWORDS.slice(0, 5);

    for (const keyword of searchKeywords) {
        try {
            const url = getGoogleNewsRssUrl(keyword);
            const feedData = await parser.parseURL(url);

            for (const item of feedData.items.slice(0, 5)) {
                if (item.title && item.link) {
                    news.push({
                        id: generateId(item.link),
                        title: item.title,
                        description: item.contentSnippet || '',
                        url: item.link,
                        source: 'Google News',
                        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
                    });
                }
            }

            console.log(`[Google News] "${keyword}": ${feedData.items.length}개 항목`);
        } catch (error) {
            console.error(`[Google News Error] ${keyword}:`, error);
        }
    }

    return news;
}

// 필터링 및 중복 제거
function filterAndDeduplicate(news: NewsItem[]): NewsItem[] {
    const now = new Date();
    const maxAge = EXCLUDE_RULES.maxAgeHours * 60 * 60 * 1000;

    // URL 기반 중복 제거
    const seen = new Set<string>();
    const unique: NewsItem[] = [];

    for (const item of news) {
        // 중복 체크
        if (seen.has(item.url)) continue;

        // 시간 필터 (24시간 이내)
        const age = now.getTime() - item.publishedAt.getTime();
        if (age > maxAge) continue;

        // 제외 키워드 체크
        const hasExcludeKeyword = EXCLUDE_RULES.excludeKeywords.some(
            kw => item.title.includes(kw) || item.description.includes(kw)
        );
        if (hasExcludeKeyword) continue;

        // 제외 패턴 체크
        const matchesExcludePattern = EXCLUDE_RULES.excludePatterns.some(
            pattern => pattern.test(item.title) || pattern.test(item.description)
        );
        if (matchesExcludePattern) continue;

        seen.add(item.url);
        unique.push(item);
    }

    return unique;
}

// 관련성 기반 정렬
function sortByRelevance(news: NewsItem[]): NewsItem[] {
    return news.sort((a, b) => {
        // 소스 점수
        const scoreA = getSourceScore(a.url);
        const scoreB = getSourceScore(b.url);

        if (scoreA !== scoreB) return scoreB - scoreA;

        // 동일 점수면 최신순
        return b.publishedAt.getTime() - a.publishedAt.getTime();
    });
}

// URL에서 고유 ID 생성
function generateId(url: string): string {
    const hash = url.split('').reduce((acc, char) => {
        return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    return Math.abs(hash).toString(36);
}
