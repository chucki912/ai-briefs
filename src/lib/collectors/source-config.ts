// 검색 키워드 설정
export const PRIMARY_KEYWORDS = [
    // 기업
    "OpenAI", "Anthropic", "Google DeepMind", "Meta AI", "Microsoft AI",
    "NVIDIA AI", "AMD AI", "xAI", "Mistral AI",

    // 기술
    "GPT-5", "Claude", "Gemini", "reasoning model", "AI agents",
    "multimodal AI", "open source AI", "LLM", "foundation model",

    // 인프라
    "AI chip", "GPU shortage", "TPU", "AI datacenter",

    // 정책
    "AI Act", "AI regulation", "AI Safety", "AI Executive Order"
];

// 카테고리별 키워드
export const TOPIC_CATEGORIES: Record<string, string[]> = {
    "Foundation Models": ["LLM", "GPT", "Claude", "Gemini", "Llama", "multimodal"],
    "AI Infrastructure": ["GPU", "TPU", "NPU", "datacenter", "cloud AI", "MLOps"],
    "Enterprise AI": ["AI copilot", "AI agent", "vertical AI", "AI security"],
    "AI Research": ["reasoning", "benchmark", "AGI", "alignment", "RAG"],
    "Policy & Ethics": ["AI regulation", "AI safety", "copyright", "labor impact"]
};

// 뉴스 소스 RSS 피드 - 우선순위별
export const RSS_FEEDS = {
    TIER_1: [
        { name: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/" },
        { name: "arXiv AI", url: "https://rss.arxiv.org/rss/cs.AI" },
        { name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml" },
    ],
    TIER_2: [
        { name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
        { name: "The Verge AI", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
        { name: "Wired AI", url: "https://www.wired.com/feed/tag/ai/latest/rss" },
        { name: "MIT Tech Review", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed" },
    ],
    TIER_3: [
        // { name: "Reuters Tech", url: "https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best" }, // 404 Error (2026-02-07)
    ]
};

// Google News RSS 검색 URL 생성
export function getGoogleNewsRssUrl(query: string): string {
    // when:1d 파라미터를 추가하여 24시간 이내 뉴스만 검색
    const encodedQuery = encodeURIComponent(query + ' when:1d');
    return `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`;
}

// 제외 규칙
export const EXCLUDE_RULES = {
    excludeKeywords: ["LG AI연구원", "LG CNS", "LG전자 AI"],
    excludePatterns: [
        /AI로 .+ 혁신/,
        /누구나 AI/,
        /단순 앱 업데이트/,
        /sponsored/i,
        /advertisement/i,
    ],
    // 24시간 이내 뉴스만
    maxAgeHours: 24
};

// 소스 도메인 우선순위 점수
export const SOURCE_PRIORITY: Record<string, number> = {
    "theinformation.com": 100,
    "axios.com": 95,
    "venturebeat.com": 90,
    "openai.com": 90,
    "anthropic.com": 90,
    "deepmind.google": 90,
    "arxiv.org": 85,
    "huggingface.co": 85,
    "techcrunch.com": 80,
    "theverge.com": 80,
    "wired.com": 75,
    "technologyreview.com": 75,
    "reuters.com": 70,
    "bloomberg.com": 70,
};

// 소스 점수 가져오기
export function getSourceScore(url: string): number {
    for (const [domain, score] of Object.entries(SOURCE_PRIORITY)) {
        if (url.includes(domain)) {
            return score;
        }
    }
    return 50; // 기본 점수
}
