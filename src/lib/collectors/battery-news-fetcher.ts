// Battery Industry News Fetcher
// 배터리 산업 전용 뉴스 수집기

import Parser from 'rss-parser';
import { NewsItem } from '@/types';
import { BATTERY_CONFIG, getBatterySourceScore, isLGExcluded } from '@/configs/battery';

const parser = new Parser({
    timeout: 10000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BatteryBriefBot/1.0)',
    },
});

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || '';
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

// 배터리 뉴스 수집 메인 함수
export async function fetchBatteryNews(): Promise<NewsItem[]> {
    const allNews: NewsItem[] = [];

    // 1. RSS 피드에서 뉴스 수집
    console.log('[Battery] Step 1: RSS 피드 수집 중...');
    const rssFeedNews = await fetchFromBatteryRssFeeds();
    allNews.push(...rssFeedNews);

    // 2. Google News에서 배터리 키워드 검색
    console.log('[Battery] Step 2: Google News 검색 중...');
    const googleNews = await fetchFromBatteryGoogleNews();
    allNews.push(...googleNews);

    if (BRAVE_API_KEY) {
        console.log('[Battery] Step 3: Brave Search 검색 중...');
        const braveNews = await fetchFromBatteryBraveSearch();
        allNews.push(...braveNews);
    }

    // 3.5. Tavily Search에서 배터리 키워드 검색 (추가)
    if (TAVILY_API_KEY) {
        console.log('[Battery] Step 3.5: Tavily Search 검색 중...');
        const tavilyNews = await fetchFromBatteryTavilySearch();
        allNews.push(...tavilyNews);
    }

    // 4. 중복 제거 및 필터링 (LG 제외 포함)
    console.log('[Battery] Step 4: 필터링 및 중복 제거...');
    const filteredNews = filterBatteryNews(allNews);

    // 5. 점수 기반 정렬
    const sortedNews = sortByBatteryRelevance(filteredNews);

    console.log(`[Battery] 총 ${sortedNews.length}개 배터리 뉴스 수집 완료`);

    return sortedNews;
}

// RSS 피드에서 뉴스 수집
async function fetchFromBatteryRssFeeds(): Promise<NewsItem[]> {
    const news: NewsItem[] = [];

    for (const feed of BATTERY_CONFIG.feeds) {
        try {
            const feedData = await parser.parseURL(feed.url);

            for (const item of feedData.items.slice(0, 10)) {
                if (item.title && item.link) {
                    // 배터리 관련 키워드가 포함된 기사만 수집
                    const content = (item.title + ' ' + (item.contentSnippet || '')).toLowerCase();
                    const isBatteryRelated = BATTERY_CONFIG.keywords.some(kw =>
                        content.includes(kw.toLowerCase())
                    );

                    if (isBatteryRelated || feed.name.includes('Electrive') || feed.name.includes('InsideEVs')) {
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
            }

            console.log(`[Battery RSS] ${feed.name}: ${feedData.items?.length || 0}개 항목`);
        } catch (error) {
            console.error(`[Battery RSS Error] ${feed.name}:`, error);
        }
    }

    return news;
}

// Google News에서 배터리 키워드 검색
async function fetchFromBatteryGoogleNews(): Promise<NewsItem[]> {
    const news: NewsItem[] = [];
    // 상위 5개 키워드만 검색
    const searchKeywords = BATTERY_CONFIG.keywords.slice(0, 5);

    for (const keyword of searchKeywords) {
        try {
            // when:1d 파라미터를 추가하여 24시간 이내 뉴스만 검색
            const encodedQuery = encodeURIComponent(keyword + ' when:1d');
            const url = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`;
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

            console.log(`[Battery Google] "${keyword}": ${feedData.items?.length || 0}개 항목`);
        } catch (error) {
            console.error(`[Battery Google Error] ${keyword}:`, error);
        }
    }

    return news;
}

// Brave Search에서 배터리 키워드 검색
async function fetchFromBatteryBraveSearch(): Promise<NewsItem[]> {
    const news: NewsItem[] = [];
    const searchKeywords = BATTERY_CONFIG.keywords.slice(0, 5);

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
                console.error(`[Battery Brave Error] ${response.status}`);
                continue;
            }

            const data = await response.json();
            const items = data.results || [];

            for (const item of items) {
                let sourceName = 'Brave Search';
                if (typeof item.source === 'string') {
                    sourceName = item.source;
                } else if (item.source?.name) {
                    sourceName = item.source.name;
                } else if (item.meta_url?.hostname) {
                    sourceName = item.meta_url.hostname;
                }

                news.push({
                    id: generateId(item.url),
                    title: item.title,
                    description: item.description || '',
                    url: item.url,
                    source: sourceName,
                    publishedAt: new Date(),
                });
            }

            console.log(`[Battery Brave] "${keyword}": ${items.length}개 항목`);
        } catch (error) {
            console.error(`[Battery Brave Error] ${keyword}:`, error);
        }
    }

    return news;
}

// Tavily Search에서 배터리 키워드 검색
async function fetchFromBatteryTavilySearch(): Promise<NewsItem[]> {
    const news: NewsItem[] = [];
    const searchKeywords = BATTERY_CONFIG.keywords.slice(0, 5);

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
                    days: 1
                }),
            });

            if (!response.ok) {
                console.error(`[Battery Tavily Error] ${response.status}`);
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
                    publishedAt: new Date(),
                });
            }

            console.log(`[Battery Tavily] "${keyword}": ${results.length}개 항목`);
        } catch (error) {
            console.error(`[Battery Tavily Error] ${keyword}:`, error);
        }
    }

    return news;
}

// 필터링 및 중복 제거 (LG 제외 포함)
function filterBatteryNews(news: NewsItem[]): NewsItem[] {
    const now = new Date();
    const maxAge = BATTERY_CONFIG.maxAgeHours * 60 * 60 * 1000;

    const seenUrls = new Set<string>();
    const seenTitles: string[] = [];
    const unique: NewsItem[] = [];

    for (const item of news) {
        // 1. URL 중복 체크
        if (seenUrls.has(item.url)) continue;

        // 2. 제목 유사도 체크
        const cleanTitle = item.title.replace(/[^\w\s]/gi, '').toLowerCase();
        const isDuplicateTitle = seenTitles.some(seenTitle =>
            calculateSimilarity(cleanTitle, seenTitle) > 0.7
        );
        if (isDuplicateTitle) continue;

        // 3. 시간 필터 (24시간 이내)
        const age = now.getTime() - item.publishedAt.getTime();
        if (age > maxAge) continue;

        // 4. ⚡ LG 제외 필터 (K-Battery Outside-in 관점)
        if (isLGExcluded(item.title, item.description)) {
            console.log(`[Battery Filter] LG 제외: ${item.title.substring(0, 50)}...`);
            continue;
        }

        // 5. 제외 패턴 체크
        const matchesExcludePattern = BATTERY_CONFIG.excludePatterns.some(
            pattern => pattern.test(item.title) || pattern.test(item.description)
        );
        if (matchesExcludePattern) continue;

        seenUrls.add(item.url);
        seenTitles.push(cleanTitle);
        unique.push(item);
    }

    return unique;
}

// 제목 유사도 계산 (Jaccard Index)
function calculateSimilarity(str1: string, str2: string): number {
    const set1 = new Set(str1.split(/\s+/));
    const set2 = new Set(str2.split(/\s+/));

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
}

// 배터리 소스 우선순위 기반 정렬
function sortByBatteryRelevance(news: NewsItem[]): NewsItem[] {
    return news.sort((a, b) => {
        const scoreA = getBatterySourceScore(a.url);
        const scoreB = getBatterySourceScore(b.url);

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
