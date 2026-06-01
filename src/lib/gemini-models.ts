/**
 * Gemini API 모델 상수 관리
 * 
 * 프로젝트 전체에서 사용되는 Gemini 모델명을 중앙화하여 관리합니다.
 * 모델 버전 업데이트 시 이 파일만 수정하면 자동으로 모든 곳에 반영됩니다.
 */

/**
 * Flash 모델 - 빠른 응답이 필요한 경우
 * 용도: 뉴스 분석, AI 클러스터링, 중복 체크 등 자주 호출되는 작업
 * 특징: 낮은 지연시간, 비용 효율적
 */
export const FLASH_MODEL = 'gemini-3.5-flash';

/**
 * Pro 모델 - 심층적인 분석이 필요한 경우
 * 용도: 상세 리포트 생성, 심층 분석
 * 특징: 높은 품질, 더 복잡한 추론 가능
 */
export const PRO_MODEL = 'gemini-3.1-pro-preview';
