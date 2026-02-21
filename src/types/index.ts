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

// 이슈 아이템 타입
export interface IssueItem {
  category?: string;
  oneLineSummary?: string;
  hashtags?: string[];
  headline: string;
  keyFacts: string[];
  insight: string;
  framework: string;
  sources: string[];
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
