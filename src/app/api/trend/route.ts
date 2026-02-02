import { NextRequest, NextResponse } from 'next/server';
import { IssueItem } from '@/types';
import { generateTrendReport } from '@/lib/gemini';
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';

export const maxDuration = 60; // Vercel Function Timeout (Seconds)

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { issue } = body as { issue: IssueItem };

        if (!issue) {
            return NextResponse.json(
                { success: false, error: '이슈 정보가 제공되지 않았습니다.' },
                { status: 400 }
            );
        }

        console.log(`[Trend API] 리포트 생성 요청: ${issue.headline}`);

        // 1. 소스 URL에서 본문 스크래핑 (병렬 처리)
        // 상위 3개 소스만 분석 (속도 및 토큰 제한 고려)
        const targetSources = issue.sources.slice(0, 3);
        const articles = await Promise.all(
            targetSources.map(async (url) => {
                try {
                    const response = await fetch(url, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                        signal: AbortSignal.timeout(15000) // 15초 타임아웃으로 연장
                    });

                    if (!response.ok) return null;

                    const html = await response.text();
                    const { window } = parseHTML(html);
                    const reader = new Readability(window.document);
                    const article = reader.parse();

                    return article ? `
---
Title: ${article.title || 'Unknown Title'}
Source: ${url}
Content: ${article.textContent}
---
` : null;
                } catch (error) {
                    console.error(`[Scrape Error] ${url}:`, error);
                    return null;
                }
            })
        );

        // 유효한 기사 본문 합치기
        const context = articles.filter(Boolean).join('\n');

        if (!context) {
            console.warn('[Trend API] 스크래핑 실패, 기본 정보로만 분석합니다.');
        } else {
            console.log(`[Trend API] 스크래핑 완료: ${context.length}자 확보`);
        }

        // 2. Gemini를 사용하여 리포트 생성
        const report = await generateTrendReport(issue, context);

        if (!report) {
            return NextResponse.json(
                { success: false, error: '리포트 생성에 실패했습니다 (AI 응답 오류).' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, data: { report } });

    } catch (error) {
        console.error('[Trend API Error]', error);
        return NextResponse.json(
            { success: false, error: '서버 내부 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
