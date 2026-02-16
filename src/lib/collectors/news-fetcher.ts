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

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || '';
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

// 뉴스 수집 메인 함수
export async function fetchAllNews(): Promise<NewsItem[]> {
    const allNews: NewsItem[] = [];

    // 1. RSS 피드에서 뉴스 수집
    const rssFeedNews = await fetchFromRssFeeds();
    allNews.push(...rssFeedNews);

    // 2. Google News에서 주요 키워드 검색
    const googleNews = await fetchFromGoogleNews();
    allNews.push(...googleNews);

    // 3. Brave Search에서 주요 키워드 검색 (강화)
    if (BRAVE_API_KEY) {
        const braveNews = await fetchFromBraveSearch();
        allNews.push(...braveNews);
    } else {
        console.warn('[NewsCollector] Brave API Key가 설정되지 않아 건너뜁니다.');
    }

    // 4. Tavily Search에서 주요 키워드 검색 (추가)
    if (TAVILY_API_KEY) {
        const tavilyNews = await fetchFromTavilySearch();
        allNews.push(...tavilyNews);
    } else {
        console.warn('[NewsCollector] Tavily API Key가 설정되지 않아 건너뜁니다.');
    }

    // 5. 중복 제거 및 필터링
    const filteredNews = filterAndDeduplicate(allNews);

    // 6. 점수 기반 정렬
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

    // 주요 키워드 5개만 검색 (API 호출 제한 고려)
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

// Brave Search에서 키워드 검색
async function fetchFromBraveSearch(): Promise<NewsItem[]> {
    const news: NewsItem[] = [];
    // Google News와 동일한 주요 키워드 사용 (교차 검증/보완)
    const searchKeywords = PRIMARY_KEYWORDS.slice(0, 5);

    for (const keyword of searchKeywords) {
        try {
            const response = await fetch(
                `https://api.search.brave.com/res/v1/news/search?q=${encodeURIComponent(keyword)}&count=5&search_lang=en&freshness=pd`,
                {
                    headers: {
                        'Accept': 'application/json',
                        'X-Subscription-Token': BRAVE_API_KEY
                    }
                }
            );

            if (!response.ok) {
                console.error(`[Brave API Error] ${response.status} ${response.statusText}`);
                continue;
            }

            const data = await response.json();
            const items = data.results || [];

            for (const item of items) {
                // Brave API의 source 필드 처리 (문자열 또는 객체일 수 있음)
                // 보통 { domain: string, name: string } 형태이거나 단순 문자열
                let sourceName = 'Brave Search';
                if (typeof item.source === 'string') {
                    sourceName = item.source;
                } else if (item.source && typeof item.source === 'object' && 'name' in item.source) {
                    // @ts-ignore - source might be any
                    sourceName = item.source.name;
                } else if (item.meta_url && item.meta_url.hostname) {
                    sourceName = item.meta_url.hostname;
                }

                news.push({
                    id: generateId(item.url),
                    title: item.title,
                    description: item.description || '',
                    url: item.url,
                    source: sourceName,
                    publishedAt: new Date(), // Brave doesn't guarantee absolute date, treat as fresh
                });
            }

            // Fix publishedAt for Brave items if possible (Brave returns 'age' string usually).
            // For now, let's treat them as "fresh" (new Date()).

            console.log(`[Brave Search] "${keyword}": ${items.length}개 항목`);
        } catch (error) {
            console.error(`[Brave Search Error] ${keyword}:`, error);
        }
    }

    return news;
}

// Tavily Search에서 키워드 검색
async function fetchFromTavilySearch(): Promise<NewsItem[]> {
    const news: NewsItem[] = [];
    const searchKeywords = PRIMARY_KEYWORDS.slice(0, 5);

    for (const keyword of searchKeywords) {
        try {
            const response = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    api_key: TAVILY_API_KEY,
                    query: keyword,
                    search_depth: 'basic',
                    include_answer: false,
                    include_images: false,
                    include_raw_content: false,
                    max_results: 5,
                    days: 1 // 최신 뉴스 위주
                }),
            });

            if (!response.ok) {
                console.error(`[Tavily API Error] ${response.status} ${response.statusText}`);
                continue;
            }

            const data = await response.json();
            const results = data.results || [];

            for (const result of results) {
                news.push({
                    id: generateId(result.url),
                    title: result.title,
                    description: result.content || '',
                    url: result.url,
                    source: 'Tavily Search',
                    publishedAt: new Date(), // Tavily results are fresh
                });
            }

            console.log(`[Tavily Search] "${keyword}": ${results.length}개 항목`);
        } catch (error) {
            console.error(`[Tavily Search Error] ${keyword}:`, error);
        }
    }

    return news;
}

// 필터링 및 중복 제거
function filterAndDeduplicate(news: NewsItem[]): NewsItem[] {
    const now = new Date();
    const maxAge = EXCLUDE_RULES.maxAgeHours * 60 * 60 * 1000;

    // URL 기반 중복 제거
    const seenUrls = new Set<string>();
    // 제목 기반 중복 제거 (유사도 체크)
    const seenTitles: string[] = [];

    const unique: NewsItem[] = [];

    for (const item of news) {
        // 1. URL 중복 체크
        if (seenUrls.has(item.url)) continue;

        // 2. 제목 유사도 체크 (이전 수집된 뉴스들과 비교)
        // 제목에서 특수문자 제거 후 비교
        const cleanTitle = item.title.replace(/[^\w\s]/gi, '').toLowerCase();
        const isDuplicateTitle = seenTitles.some(seenTitle => {
            return calculateSimilarity(cleanTitle, seenTitle) > 0.7; // 70% 이상 유사하면 중복 처리
        });
        if (isDuplicateTitle) continue;

        // 3. 시간 필터 (24시간 이내)
        // Brave item might have meaningless date, so skip check if date looks invalid/current? 
        // No, fetcher logic assigned new Date() if unknown, so it's always "now".
        // Keep logic.
        const age = now.getTime() - item.publishedAt.getTime();
        if (age > maxAge) continue;

        // 4. 제외 키워드 체크
        const hasExcludeKeyword = EXCLUDE_RULES.excludeKeywords.some(
            kw => item.title.includes(kw) || item.description.includes(kw)
        );
        if (hasExcludeKeyword) continue;

        // 5. 제외 패턴 체크
        const matchesExcludePattern = EXCLUDE_RULES.excludePatterns.some(
            pattern => pattern.test(item.title) || pattern.test(item.description)
        );
        if (matchesExcludePattern) continue;

        seenUrls.add(item.url);
        seenTitles.push(cleanTitle);
        unique.push(item);
    }

    return unique;
}

// 제목 유사도 계산 (Levenshtein Distance 기반 간소화 or Jaccard Index)
// 여기서는 간단히 단어 세트 비교 (Jaccard Index) 사용
function calculateSimilarity(str1: string, str2: string): number {
    const set1 = new Set(str1.split(/\s+/));
    const set2 = new Set(str2.split(/\s+/));

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
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
