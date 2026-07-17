/** 주간 AI 단신 생성기 — 도메인 타입 */
import type { ReportType } from '@/types';

/** 한 꼭지의 출처 정보 (발표일/출처 라인 파싱 결과) */
export interface FlashSource {
  /** 게재일 (확인 불가 시 빈 문자열) */
  publishedDate: string;
  /** 매체명 */
  outlet: string;
  /** 기사 제목 */
  articleTitle: string;
  /** 확인 가능한 링크 (없으면 빈 문자열 → 미확인 배지) */
  link: string;
  /** 파싱이 불완전할 때 원문 라인 전체 (폴백 표시용) */
  raw: string;
}

/** 뉴스 단신 1꼭지 */
export interface FlashItem {
  index: number;
  title: string;
  source: FlashSource;
  /** 주요 내용 */
  mainContent: string;
  /** 트렌드 해석 */
  trendInterpretation: string;
  /** 경영 시사점 */
  managementImplication: string;
  /** CEO 질문 가능성 */
  ceoQuestion: string;
  /** [기준 외 확장] 표기 포함 여부 (D-14 확장 항목) */
  isExtended: boolean;
  /** "미확인" 문구 포함 여부 (검증 안 된 수치/출처) */
  hasUnverified: boolean;
}

/** 종합 시사점 */
export interface FlashSummary {
  /** 산업 변화 방향 */
  industryDirection: string;
  /** 국내 대기업/LG 대응 방향 */
  koreanResponse: string;
}

/** grounding 검색에서 모델이 참조한 출처 (검증 보조용) */
export interface GroundingSource {
  url: string;
  title: string;
}

/** 생성된 단신 메모 전체 */
export interface FlashMemo {
  /** 메모 날짜 (YYYY-MM-DD) */
  date: string;
  /** 제목 라인 전문 */
  title: string;
  /** "기준 충족 뉴스 N건" 의 N (파싱 실패 시 null) */
  matchedCount: number | null;
  items: FlashItem[];
  summary: FlashSummary | null;
  /** 모델이 반환한 원문 메모 전체 (복사/MD/PDF 내보내기용) */
  rawText: string;
  /** grounding 검색 출처 목록 (앱이 보정하지 않은 원본) */
  groundingSources: GroundingSource[];
  /** 검색 윈도우 (7 | 14) */
  windowDays: number;
  /** 사용된 기준일 (YYYY-MM-DD) */
  baseDate: string;
  /** 명시적 리포트 모드 (항상 'weekly_flash') */
  reportType: ReportType;
}

/** /api/weekly-flash 응답 형태 */
export interface FlashApiResponse {
  success: boolean;
  data?: FlashMemo;
  error?: string;
}
