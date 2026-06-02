import { NextResponse } from 'next/server';
import { generateWeeklyFlash } from '@/lib/weekly-flash/gemini';
import { FlashApiResponse } from '@/lib/weekly-flash/types';

// 항상 동적 실행 (캐시 금지) + grounding 검색 여유 시간 확보
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request): Promise<NextResponse<FlashApiResponse>> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'GEMINI_API_KEY 가 설정되지 않았습니다. .env.local 을 확인하세요.' },
        { status: 500 },
      );
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));

    // 검색 확장 토글: 14 만 허용, 그 외 전부 7
    const windowDays = body.windowDays === 14 ? 14 : 7;

    // 기준일: 유효한 YYYY-MM-DD 면 사용, 아니면 서버의 오늘(KST)
    const todayKst = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
    const baseDate =
      typeof body.baseDate === 'string' && DATE_RE.test(body.baseDate)
        ? body.baseDate
        : todayKst;

    console.log(`[WeeklyFlash] 생성 시작 — 기준일 ${baseDate}, 윈도우 D-${windowDays}`);

    const memo = await generateWeeklyFlash({ baseDate, windowDays });

    console.log(
      `[WeeklyFlash] 완료 — 꼭지 ${memo.items.length}건, grounding 출처 ${memo.groundingSources.length}건`,
    );

    return NextResponse.json({ success: true, data: memo });
  } catch (error) {
    console.error('[WeeklyFlash Error]', error);
    return NextResponse.json(
      {
        success: false,
        error: '단신 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      },
      { status: 500 },
    );
  }
}
