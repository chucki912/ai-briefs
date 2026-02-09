// Battery Industry Configuration
// K-Battery 관점의 배터리 산업 브리프용 설정

export interface RssFeed {
    name: string;
    url: string;
}

export interface AnalysisFramework {
    id: string;
    name: string;
    triggerKeywords: string[];
    insightTemplate: string;
}

export const BATTERY_CONFIG = {
    id: 'battery',
    name: 'Battery Industry',
    displayName: '🔋 Battery Daily Brief',
    subtitle: 'K-Battery 관점의 글로벌 배터리 산업 인텔리전스',

    // 검색 키워드 (User Prompt 기반)
    keywords: [
        // 셀 제조사
        "CATL", "BYD", "Samsung SDI", "SK On", "Panasonic",
        // 자동차 OEM
        "Tesla battery", "Ford EV", "GM Ultium", "VW battery", "BMW battery",
        // 소재 기업
        "Albemarle", "SQM", "Ganfeng", "Umicore", "BASF cathode",
        // 기술
        "LFP battery", "NCM battery", "solid-state battery", "sodium-ion battery",
        // 소재
        "lithium price", "nickel battery", "cobalt supply", "graphite anode",
        // 정책
        "IRA battery", "CRMA", "battery tariff", "EV subsidy"
    ],

    // RSS 피드 (Tier 1 해외 원문 소스 우선)
    feeds: [
        // Tier 1: 배터리/EV 전문 미디어
        { name: "Electrive", url: "https://www.electrive.com/feed/" },
        { name: "InsideEVs", url: "https://insideevs.com/rss/news/" },
        { name: "CleanTechnica", url: "https://cleantechnica.com/feed/" },
        // Tier 1: 비즈니스/산업 미디어
        { name: "Reuters Business", url: "https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best" },
        { name: "Nikkei Asia", url: "https://asia.nikkei.com/rss" },
        // Tier 2: 테크 미디어
        { name: "TechCrunch Startups", url: "https://techcrunch.com/category/startups/feed/" },
        { name: "The Verge Tech", url: "https://www.theverge.com/rss/index.xml" },
    ] as RssFeed[],

    // 제외 키워드 (LG 제외 - Outside-in 관점)
    excludeKeywords: [
        "LG에너지솔루션", "LG Energy Solution", "LGES",
        "LG화학 배터리", "LG Chem battery",
        "LG전자 배터리", "LG Electronics battery"
    ],

    // 제외 패턴
    excludePatterns: [
        /배터리 혁명/,
        /친환경 미래/,
        /sponsored/i,
        /advertisement/i,
    ],

    // 소스 도메인 우선순위 점수
    sourcePriority: {
        // Tier 1: 배터리 전문
        "electrive.com": 100,
        "benchmarkminerals.com": 100,
        "fastmarkets.com": 95,
        "spglobal.com": 95,
        // Tier 1: 비즈니스
        "reuters.com": 90,
        "bloomberg.com": 90,
        "ft.com": 90,
        "wsj.com": 90,
        // Tier 1: 아시아
        "asia.nikkei.com": 85,
        // Tier 2: EV/테크
        "insideevs.com": 80,
        "cleantechnica.com": 80,
        "techcrunch.com": 75,
        "theverge.com": 75,
    } as Record<string, number>,

    // 5대 분석 프레임워크 (K-Battery 관점)
    analysisFrameworks: [
        {
            id: "geopolitics",
            name: "지정학 및 패권",
            triggerKeywords: ["IRA", "CRMA", "China", "tariff", "export control", "resource nationalism"],
            insightTemplate: "글로벌 배터리 패권 균형 변화 → K-Battery 공급망 안보/시장 접근성 영향"
        },
        {
            id: "industry_structure",
            name: "산업 구조 및 BM 변화",
            triggerKeywords: ["vertical integration", "joint venture", "recycling", "servitization"],
            insightTemplate: "배터리 가치 창출/포획 방식 변화 → K-Battery 비즈니스 모델 기회/위협"
        },
        {
            id: "economic_moat",
            name: "경제적 해자",
            triggerKeywords: ["technology lock-in", "scale", "ecosystem", "barriers to entry", "cost leadership"],
            insightTemplate: "경쟁 장벽 구축 현황 → K-Battery 경쟁 포지셔닝/차별화 필요성"
        },
        {
            id: "value_chain",
            name: "밸류체인 역학",
            triggerKeywords: ["lithium shortage", "profit pool", "bottleneck", "margin squeeze", "upstream"],
            insightTemplate: "밸류체인 가치/이익 이동 → K-Battery 투자 영역/의존성 해소"
        },
        {
            id: "regulatory",
            name: "규제 및 기술 장벽",
            triggerKeywords: ["ESG", "carbon footprint", "certification", "non-tariff barrier", "due diligence"],
            insightTemplate: "신규 규제 요건 등장 → K-Battery 컴플라이언스 비용/규제 차익 기회"
        }
    ] as AnalysisFramework[],

    // Gemini 프롬프트용 역할 정의
    promptContext: `당신은 **K-Battery(한국 배터리 산업) 관점의 글로벌 배터리 산업 전략 애널리스트**입니다.

## 핵심 관점
- **Outside-in 분석**: LG에너지솔루션 등 한국 기업 뉴스는 제외하고, 해외 경쟁사/시장/정책 동향 분석
- **K-Battery 시사점**: 모든 인사이트는 한국 배터리 기업에 대한 전략적 함의 포함
- **5대 프레임워크 적용**: 지정학, 산업구조, 경제적 해자, 밸류체인, 규제 관점

## 주제 카테고리
1. 배터리 완제품 (EV, ESS, 소형 배터리)
2. 배터리 소재 및 부품 (양극재, 음극재, 전해질, 분리막)
3. 핵심 광물 및 공급망 (리튬, 니켈, 코발트, 흑연)
4. 차세대 기술 (전고체, 나트륨이온, 리튬메탈)
5. 정책, 규제 및 무역 (IRA, CRMA, 관세, 인증)

## 작성 톤
- 객관적, 건조한 분석 톤
- 수치, 공식 발언, 검증된 데이터 기반
- 감정적 표현 배제 ("놀라운", "충격적인" 금지)
- 불확실 정보는 "추정됨", "가능성 있음" 표시`,

    // 날짜 필터 (24시간 이내)
    maxAgeHours: 24,
};

// 소스 점수 가져오기 함수
export function getBatterySourceScore(url: string): number {
    for (const [domain, score] of Object.entries(BATTERY_CONFIG.sourcePriority)) {
        if (url.includes(domain)) {
            return score;
        }
    }
    return 50; // 기본 점수
}

// LG 제외 필터 함수
export function isLGExcluded(title: string, description: string): boolean {
    const content = (title + ' ' + description).toLowerCase();
    return BATTERY_CONFIG.excludeKeywords.some(kw =>
        content.includes(kw.toLowerCase())
    );
}
