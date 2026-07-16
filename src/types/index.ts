// 뉴스 아이템 타입
export interface NewsItem {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: Date;
  category?: string;
}

// 분석 프레임워크 타입
export interface AnalysisFramework {
  name: string;
  triggers: string[];
  insightTemplate: string;
}

// ── 구조화 스키마 (responseSchema 마이그레이션) ──────────────────────────────
// 소스 참조: 카드 단위가 아니라 fact가 결박할 대상(R2)
export interface SourceRef {
  id: string;               // "s1", "s2" ...
  url: string;
  outlet?: string;          // 해석된 매체명(R4 전까지는 NewsItem.source)
  title?: string;
  publishedAt?: string;     // ISO. Google 리다이렉트는 미해석 가능(R4)
  resolved?: boolean;       // canonical 해석 성공 여부(false면 C2 실패 취급)
}

// keyFact: 보도된 사실 + 근거 소스 결박(≥1) + 발행일 (R1/R2/D10)
export interface KeyFactStructured {
  id: string;               // "f1", "f2" ...
  text: string;             // 보도 사실만(메커니즘/추론 금지)
  sourceIds: string[];      // ≥1 (C1). 빈 배열이면 스키마 무효
  publishedAt?: string;
}

// keyInsight: 추론임을 명시 + 근거 fact 결박 + 확신도 + '지루한 대안'(D5 억제)
export interface KeyInsightStructured {
  text: string;
  claimType: 'inferred';
  restsOnFactIds: string[]; // ⊆ keyFacts.id (C4)
  confidence: 'high' | 'medium' | 'low';
  mundaneAlternative: string;
}

export type ActionType = 'act' | 'observe' | 'none';

// So What 재설계 (D9): actionType 게이트 + 조건부 블록 + 양쪽 비용 + 되돌림성
export interface SoWhatV2 {
  ifInferenceHolds: string; // 사실이 아니라 '추론'에 조건을 검
  unknown: string;
  actionType: ActionType;   // 먼저 고른다(none 합법화)
  action?: {                // actionType==='act'일 때만
    what: string;
    reversible: boolean;
    costIfWrong: string;
    costIfMissed: string;   // 신규: 안 움직였는데 맞았을 때
  };
  observe?: {               // actionType==='observe'일 때만
    metric: string;         // 무엇을 세는가("지켜본다"만으론 불가)
    cadence: string;
  };
  killTrigger: string;      // 날짜/수치 포함(C5)
}

export interface IssueItem {
  category?: string;
  singleTopicStatement?: string;
  excludedFacts?: string[];
  prescriptionLevel?: string;
  oneLineSummary?: string;
  hashtags?: string[];
  headline: string;
  keyFacts: string[];       // legacy(파생): structuredFacts[].text
  insight: string;          // legacy(파생): keyInsight.text
  confidence?: 'high' | 'medium' | 'low' | string;
  framework: string;
  sources: string[];        // legacy(파생): sourceRefs[].url
  soWhat?: {                // legacy 4분면(하위호환 렌더러용, V2에서 파생)
    ifTrue: string;
    uncertain: string;
    bet: string;
    downside: string;
  };
  // ── 구조화 필드(신규, responseSchema 산출) ──
  structuredFacts?: KeyFactStructured[];
  sourceRefs?: SourceRef[];
  keyInsight?: KeyInsightStructured;
  soWhatV2?: SoWhatV2;
  thesis?: string;          // F: singleTopicStatement+oneLineSummary 병합 단일 논지
  clusterSize?: number;     // 사전태그: 생성 당시 입력 클러스터 크기(임계값 아님, 사후 분석용 기록)
}

// 브리핑 리포트 타입
export interface BriefReport {
  id: string;
  date: string;
  dayOfWeek: string;
  issues: IssueItem[];
  totalIssues: number;
  generatedAt: string;
  markdown: string;
}

// 데이터베이스 저장용 타입
export interface BriefRecord {
  id: string;
  date: string;
  report: string; // JSON stringified BriefReport
  created_at: string;
}

// API 응답 타입
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
