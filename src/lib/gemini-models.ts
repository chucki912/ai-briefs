/**
 * LLM 모델 상수 관리 (OpenRouter 모델 슬러그)
 *
 * 프로젝트 전체에서 사용되는 모델명을 중앙화하여 관리합니다.
 * 모델 버전 업데이트 시 이 파일만 수정하면 자동으로 모든 곳에 반영됩니다.
 * 호출은 llm-client.ts(OpenRouter 어댑터)를 거칩니다. 파일명은 import 경로 호환을 위해 유지.
 */

/**
 * Flash 등급 - 빠른 응답이 필요한 경우
 * 용도: 뉴스 분석, AI 클러스터링, 중복 체크 등 자주 호출되는 작업
 */
export const FLASH_MODEL = 'deepseek/deepseek-v4.1-flash';

/**
 * Pro 등급 - 심층적인 분석이 필요한 경우
 * 용도: 상세 리포트 생성, 심층 분석 (웹 검색 grounding 패스 포함)
 * 현재 Flash와 동일 모델 — 등급 분리는 유지해 추후 상위 모델로 개별 교체 가능.
 */
export const PRO_MODEL = 'deepseek/deepseek-v4.1-flash';
