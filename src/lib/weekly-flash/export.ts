/**
 * 주간 AI 단신 생성기 — 내보내기 유틸 (클라이언트 전용)
 *
 * 복사 / Markdown 다운로드 / PDF(인쇄) 를 담당.
 * 모든 출력은 모델이 반환한 원문(rawText)을 기준으로 하여, 파싱 손실 없이
 * 메모 전문을 보존한다. 우선순위: 복사 > MD > PDF.
 */
import { FlashMemo } from './types';
import { FLASH_DISCLAIMER } from './prompt';

/** 메모 전문 + 고정 안내문 (복사/MD 공통) */
export function buildMemoText(memo: FlashMemo): string {
  const extended =
    memo.windowDays > 7 ? ' · D-14 확장 검색' : '';
  const header = `# 최근 1주일 AI 산업 단신 (기준일 ${memo.baseDate}${extended})\n`;
  return `${header}\n${memo.rawText}\n\n---\n${FLASH_DISCLAIMER}\n`;
}

/** 클립보드 복사 */
export async function copyMemo(memo: FlashMemo): Promise<void> {
  await navigator.clipboard.writeText(buildMemoText(memo));
}

/** Markdown(.md) 파일 다운로드 */
export function downloadMarkdown(memo: FlashMemo): void {
  const text = buildMemoText(memo);
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai-flash-${memo.baseDate}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** PDF: 브라우저 인쇄 다이얼로그 (인쇄용 스타일시트로 메모 영역만 출력) */
export function printMemo(): void {
  window.print();
}
