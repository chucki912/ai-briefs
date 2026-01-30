import { AnalysisFramework } from '@/types';

// 7대 분석 프레임워크
export const ANALYSIS_FRAMEWORKS: Record<string, AnalysisFramework> = {
    geopolitics: {
        name: "지정학 및 패권",
        triggers: ["수출통제", "칩 전쟁", "데이터 주권", "탈중국", "디지털 철의 장막",
            "export control", "chip war", "data sovereignty", "decoupling", "China", "US"],
        insightTemplate: "K-AI 관점에서의 위기/기회/전략적 함의"
    },

    structural_shift: {
        name: "산업 구조 및 BM 변화",
        triggers: ["AI 에이전트 경제", "API 경제", "오픈소스 vs 클로즈드", "플랫폼 지배력",
            "agent economy", "API economy", "open source", "closed source", "platform"],
        insightTemplate: "한국 AI 기업의 포지셔닝 전략 시사점"
    },

    economic_moat: {
        name: "경제적 해자",
        triggers: ["데이터 락인", "스케일 게임", "생태계 장악", "진입장벽",
            "data moat", "scale", "ecosystem", "barrier", "lock-in"],
        insightTemplate: "국내 기업의 경쟁력 확보 방안"
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

    // 점수 높은 순으로 정렬 후 상위 2개 반환
    matches.sort((a, b) => b.score - a.score);

    // 매칭되는 게 없으면 기본 프레임워크 반환
    if (matches.length === 0) {
        return [ANALYSIS_FRAMEWORKS.structural_shift];
    }

    return matches.slice(0, 2).map(m => m.framework);
}

// 프레임워크 이름 목록 반환
export function getFrameworkNames(frameworks: AnalysisFramework[]): string {
    return frameworks.map(f => f.name).join(', ');
}
