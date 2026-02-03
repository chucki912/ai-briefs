import { NextRequest, NextResponse } from 'next/server';
import { IssueItem } from '@/types';
import { generateTrendReport } from '@/lib/gemini';
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import { kvSet, kvGet } from '@/lib/store';
import { waitUntil } from '@vercel/functions';

export const maxDuration = 60; // 60초 (Hobby Plan 한계)

// 비동기 작업 처리 함수
async function processTrendReport(jobId: string, issue: IssueItem) {
    try {
        console.log(`[Job:${jobId}] 백그라운드 작업 시작: ${issue.headline}`);

        // 1. 소스 URL 스크래핑 (최대한 많이, 꼼꼼하게)
        // 사용자의 요청대로 소스 제한 없이, 충분한 타임아웃으로 수행
        const targetSources = issue.sources;
        console.log(`[Job:${jobId}] 총 ${targetSources.length}개 소스 스크래핑 시작`);

        const articles = await Promise.all(
            targetSources.map(async (url) => {
                try {
                    const response = await fetch(url, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        },
                        // 충분한 대기 시간 설정 (품질 우선)
                        signal: AbortSignal.timeout(20000)
                    });

                    if (!response.ok) return null;

                    const html = await response.text();
                    const { window } = parseHTML(html);
                    const reader = new Readability(window.document);
                    const article = reader.parse();

                    if (!article?.textContent || article.textContent.length < 200) return null;

                    // 텍스트 최적화: 불필요한 공백 제거 및 길이 제한 (최대 3만 자)
                    const cleanContent = article.textContent
                        .replace(/\n\s*\n/g, '\n') // 연속된 줄바꿈 제거
                        .slice(0, 30000); // 기사당 최대 30,000자로 제한 (약 10,000 토큰)

                    return `
---\nTitle: ${article.title || 'Unknown Title'}\nSource: ${url}\nContent: ${cleanContent}\n---\n`;
                } catch (error) {
                    console.error(`[Scrape Error] ${url}:`, error);
                    return null;
                }
            })
        );

        const validArticles = articles.filter(Boolean);
        // 전체 컨텍스트 길이도 안전장치로 제한 (약 15만 자)
        const context = validArticles.join('\n').slice(0, 150000);

        console.log(`[Job:${jobId}] 스크래핑 완료: 유효 기사 ${validArticles.length}개, 총 길이 ${context.length}자 (제한적용)`);

        // 2. Gemini 심층 분석 (Gemini 3 Pro)
        const report = await generateTrendReport(issue, context);

        if (report) {
            // 성공 시 결과 저장 (1시간 유지)
            await kvSet(`trend_job:${jobId}`, { status: 'completed', report }, 3600);
            console.log(`[Job:${jobId}] 작업 성공 및 저장 완료`);
        } else {
            throw new Error('리포트 생성 실패 (Empty Output)');
        }

    } catch (error) {
        console.error(`[Job:${jobId}] 작업 실패:`, error);
        await kvSet(`trend_job:${jobId}`, { status: 'failed', error: '리포트 생성 중 오류가 발생했습니다.' }, 3600);
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { issue } = body as { issue: IssueItem };

        if (!issue) {
            return NextResponse.json({ success: false, error: 'Issue data required' }, { status: 400 });
        }

        // 고유 Job ID 생성
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 초기 상태 저장
        await kvSet(`trend_job:${jobId}`, { status: 'processing' }, 3600);

        // 백그라운드 작업 시작 (Vercel waitUntil 활용)
        // waitUntil을 사용하면 응답을 보낸 후에도 함수가 계속 실행됨
        waitUntil(processTrendReport(jobId, issue));

        // 즉시 응답 반환
        return NextResponse.json({
            success: true,
            data: { jobId, status: 'processing', message: '리포트 생성이 시작되었습니다.' }
        });

    } catch (error) {
        console.error('[API Error]', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
