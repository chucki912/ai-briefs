/**
 * 주간 AI 단신 생성기 — 메모 텍스트 파서
 *
 * 모델은 고정된 라벨 형식의 한국어 메모를 반환한다(prompt.ts [출력 형식] 참고).
 * 카드 렌더링을 위해 구조화하되, 어떤 단계가 실패해도 throw 하지 않고
 * 가능한 부분만 채운다. 복사/내보내기는 항상 rawText(원문) 를 사용하므로
 * 파싱이 불완전해도 사용자가 손실 없이 결과를 받는다.
 */
import { FlashItem, FlashSource, FlashSummary } from './types';

/** "날짜:" 라인에서 YYYY-MM-DD 추출 */
function parseDate(text: string): string {
  const m = text.match(/날짜\s*[:：]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
  if (m) return m[1];
  const any = text.match(/([0-9]{4}-[0-9]{2}-[0-9]{2})/);
  return any ? any[1] : '';
}

/** "제목:" 라인 전문 추출 */
function parseTitle(text: string): string {
  const m = text.match(/제목\s*[:：]\s*(.+)/);
  return m ? m[1].trim() : '';
}

/** 제목 라인의 "기준 충족 뉴스 N건" → N */
function parseMatchedCount(title: string): number | null {
  const m = title.match(/([0-9]+)\s*건/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * 한 꼭지 블록에서 라벨 필드 값 추출.
 * `- 라벨:` 부터 다음 알려진 라벨 또는 블록 끝까지 캡처.
 */
const FIELD_LABELS = [
  '발표일/출처',
  '주요 내용',
  '트렌드 해석',
  '경영 시사점',
  'CEO 질문 가능성',
];

function extractField(block: string, label: string): string {
  // 다음 라벨들 중 하나가 등장하면 종료
  const others = FIELD_LABELS.filter((l) => l !== label)
    .map((l) => l.replace(/[/]/g, '\\/'))
    .join('|');
  const re = new RegExp(
    `[-•*]?\\s*${label.replace(/[/]/g, '\\/')}\\s*[:：]\\s*([\\s\\S]*?)(?=\\n\\s*[-•*]?\\s*(?:${others})\\s*[:：]|$)`,
  );
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

/** "발표일/출처" 값 파싱: "{게재일} / {매체명}, "{기사 제목}", {링크}" */
function parseSource(rawValue: string): FlashSource {
  const source: FlashSource = {
    publishedDate: '',
    outlet: '',
    articleTitle: '',
    link: '',
    raw: rawValue.trim(),
  };
  if (!rawValue) return source;

  // 링크: 첫 http(s) URL
  const linkMatch = rawValue.match(/(https?:\/\/[^\s)"']+)/);
  if (linkMatch) source.link = linkMatch[1];

  // 기사 제목: 따옴표(" " 또는 “ ”) 안
  const titleMatch = rawValue.match(/[""]([^""]+)[""]/);
  if (titleMatch) source.articleTitle = titleMatch[1].trim();

  // 게재일: 첫 " / " 앞부분
  const slashIdx = rawValue.indexOf('/');
  if (slashIdx > -1) {
    source.publishedDate = rawValue.slice(0, slashIdx).trim();
    const rest = rawValue.slice(slashIdx + 1).trim();
    // 매체명: 첫 쉼표 앞 (기사 제목 따옴표 이전)
    const outlet = rest.split(/[,，]/)[0];
    source.outlet = outlet.replace(/[""].*$/, '').trim();
  } else {
    // 슬래시 없으면 첫 쉼표 앞을 매체명으로
    source.outlet = rawValue.split(/[,，]/)[0].trim();
  }

  return source;
}

/** 본문(내용~종합 시사점 직전)을 꼭지 단위로 분리 */
function splitItems(body: string): string[] {
  // 줄 시작의 "1." "2." ... 기준 분리
  const parts = body.split(/\n(?=\s*[0-9]+\s*[.)]\s+)/);
  return parts
    .map((p) => p.trim())
    .filter((p) => /^[0-9]+\s*[.)]/.test(p));
}

function parseItem(block: string): FlashItem {
  const indexMatch = block.match(/^([0-9]+)\s*[.)]/);
  const index = indexMatch ? parseInt(indexMatch[1], 10) : 0;

  // 제목: 번호 뒤 첫 줄에서 다음 라벨 전까지
  const firstLine = block
    .replace(/^[0-9]+\s*[.)]\s*/, '')
    .split('\n')[0]
    .trim();
  const title = firstLine.replace(/\[기준 외 확장\]/g, '').trim();

  const sourceRaw = extractField(block, '발표일/출처');

  return {
    index,
    title,
    source: parseSource(sourceRaw),
    mainContent: extractField(block, '주요 내용'),
    trendInterpretation: extractField(block, '트렌드 해석'),
    managementImplication: extractField(block, '경영 시사점'),
    ceoQuestion: extractField(block, 'CEO 질문 가능성'),
    isExtended: /\[기준 외 확장\]/.test(block),
    hasUnverified: /미확인/.test(block),
  };
}

function parseSummary(text: string): FlashSummary | null {
  const idx = text.search(/종합\s*시사점/);
  if (idx === -1) return null;
  const region = text.slice(idx).replace(/종합\s*시사점\s*[:：]/, '');
  const bullets = region
    .split('\n')
    .map((l) => l.replace(/^\s*[-•*]\s*/, '').trim())
    .filter((l) => l.length > 0);
  if (bullets.length === 0) return null;
  return {
    industryDirection: bullets[0] || '',
    koreanResponse: bullets[1] || '',
  };
}

/** 메모 원문 → 구조화 결과 (rawText/groundingSources 등은 호출부에서 채움) */
export function parseFlashMemo(text: string): {
  date: string;
  title: string;
  matchedCount: number | null;
  items: FlashItem[];
  summary: FlashSummary | null;
} {
  const date = parseDate(text);
  const title = parseTitle(text);
  const matchedCount = parseMatchedCount(title);

  // 본문 영역: "내용:" 이후 ~ "종합 시사점" 이전
  let body = text;
  const contentIdx = text.search(/내용\s*[:：]/);
  if (contentIdx > -1) body = text.slice(contentIdx);
  const summaryIdx = body.search(/종합\s*시사점/);
  const itemsRegion = summaryIdx > -1 ? body.slice(0, summaryIdx) : body;

  const items = splitItems(itemsRegion).map(parseItem);
  const summary = parseSummary(text);

  return { date, title, matchedCount, items, summary };
}
