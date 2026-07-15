import { AnalysisFramework } from '@/types';

/**
 * 프레임워크 신뢰 하한(J). 최고 점수가 이 값 미만이면 framework='none'.
 * 잠정값 — Phase 1.5의 30건에서 none 비율을 계측해 확정한다.
 */
export const MIN_MATCH_SCORE = 2;

// 7대 분석 프레임워크 (insightTemplate은 '적재된 수사' 제거, 작동 메커니즘 중심으로 중립화 — R5)
export const ANALYSIS_FRAMEWORKS: Record<string, AnalysisFramework> = {
    geopolitics: {
        // 구: "지정학 및 패권" / "글로벌 지정학적 역학 관계 및 전략적 함의 분석" → 중립화
        name: "규제·수출통제·공급망 정책",
        // 맨몸 "China"/"US" 트리거 제거(단일 국가명이 '패권' 렌즈로 라우팅되던 문제)
        triggers: ["수출통제", "칩 전쟁", "데이터 주권", "탈중국", "디지털 철의 장막",
            "export control", "chip war", "data sovereignty", "decoupling", "tariff", "sanction"],
        insightTemplate: "규제·수출통제·공급망 정책이 비용·시장 접근성에 미치는 구조적 영향"
    },

    structural_shift: {
        name: "산업 구조 및 BM 변화",
        triggers: ["AI 에이전트 경제", "API 경제", "오픈소스 vs 클로즈드", "플랫폼 지배력",
            "agent economy", "API economy", "open source", "closed source", "platform"],
        insightTemplate: "글로벌 핵심 사업자의 포지셔닝 및 비즈니스 모델 시사점"
    },

    economic_moat: {
        name: "경제적 해자",
        triggers: ["데이터 락인", "스케일 게임", "생태계 장악", "진입장벽",
            "data moat", "scale", "ecosystem", "barrier", "lock-in"],
        insightTemplate: "글로벌 경쟁 환경 내 핵심 경쟁 우위 확보 방안"
    },

    value_chain: {
        name: "밸류체인 역학",
        triggers: ["이익풀 이동", "병목 현상", "인재 쟁탈", "공급망",
            "profit pool", "bottleneck", "talent", "supply chain"],
        insightTemplate: "가치사슬 내 포지션 변화 전망"
    },

    regulation_tech: {
        name: "규제 및 기술 장벽",
        triggers: ["AI 안전 규제", "저작권", "편향성", "인증",
            "AI safety", "regulation", "copyright", "bias", "certification", "AI Act"],
        insightTemplate: "규제 환경 변화에 따른 대응 전략"
    },

    talent_org: {
        name: "인재 및 조직 역학",
        triggers: ["연구자 이동", "Brain Drain", "오픈소스 커뮤니티", "연구 문화",
            "researcher", "brain drain", "hiring", "team", "departure"],
        insightTemplate: "AI 인재 확보 및 조직 역량 시사점"
    },

    compute_economics: {
        name: "컴퓨팅 경제학",
        triggers: ["학습 비용", "추론 비용", "스케일링 한계", "에너지 효율",
            "training cost", "inference cost", "scaling", "energy", "compute", "GPU"],
        insightTemplate: "컴퓨팅 자원 전략 및 비용 최적화 방향"
    }
};

// 뉴스에 가장 적합한 프레임워크 1-2개 선택
export function matchFrameworks(title: string, description: string): AnalysisFramework[] {
    const text = `${title} ${description}`.toLowerCase();
    const matches: { framework: AnalysisFramework; score: number }[] = [];

    for (const [key, framework] of Object.entries(ANALYSIS_FRAMEWORKS)) {
        let score = 0;

        for (const trigger of framework.triggers) {
            if (text.includes(trigger.toLowerCase())) {
                score += 1;
            }
        }

        if (score > 0) {
            matches.push({ framework, score });
        }
    }

    // 점수 높은 순으로 정렬
    matches.sort((a, b) => b.score - a.score);

    // R5/J: 신뢰 하한 미달(또는 무매칭)이면 강제 기본값 대신 none([]) 반환.
    // "슬롯이 있으면 모델은 채운다" — 렌즈를 억지로 주지 않는다.
    if (matches.length === 0 || matches[0].score < MIN_MATCH_SCORE) {
        return [];
    }

    // 하한 이상인 것만 상위 2개
    return matches.filter(m => m.score >= MIN_MATCH_SCORE).slice(0, 2).map(m => m.framework);
}

// 프레임워크 이름 목록 반환 (none이면 'none')
export function getFrameworkNames(frameworks: AnalysisFramework[]): string {
    return frameworks.length ? frameworks.map(f => f.name).join(', ') : 'none';
}
