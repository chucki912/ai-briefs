/**
 * PASS 6.5 — 결정론적 길이 보정 마이크로패스 (T6 후속)
 *
 * 문제: 본문(1100~1500)·시사점(300~450)·비율(20~25%) 세 char 창을 협응하지 않는 두 LLM
 * 패스가 재생성 1회 안에 동시에 못 맞춰 정당한 트렌드가 강등됨(스모크 실측).
 *
 * 해법: 생성 후 길이가 창을 벗어나면 전체 재생성 대신 값싼 FLASH 호출로 목표 길이에
 * 맞춘다(내용·수치·마크다운 보존). 본문 목표는 시사점 길이에서 역산해 비율까지 협응.
 * 상수는 유지(임의 조정 금지). 재생성 빈도를 낮춰 800s 타이밍도 완화.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FLASH_MODEL } from '../gemini-models';
import { generateWithRetry } from '../deep-dive-pipeline';
import { LENGTH } from '@/configs/weekly-house-style';
import { charLen } from './validate-weekly';
import type { WeeklyThreadContent } from './report-gen';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const MODEL = process.env.WEEKLY_REPAIR_MODEL || FLASH_MODEL;
const TARGET_RATIO = 0.225;          // 비율 창 20~25% 중앙
const TOL = 0.08;                    // 목표 대비 허용 오차

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 텍스트를 목표 글자수(공백 제외)로 확장/축약. 내용·수치·마크다운 보존. FLASH 1~2회. */
export async function repairLength(text: string, target: number, kind: string): Promise<string> {
    const model = genAI.getGenerativeModel({ model: MODEL });
    let current = text;
    for (let attempt = 0; attempt < 2; attempt++) {
        const len = charLen(current);
        if (Math.abs(len - target) <= target * TOL) return current; // 충분히 근접
        const dir = len > target ? '축약' : '확장';
        const prompt = `다음 ${kind}을(를) 공백 제외 약 ${target}자로 ${dir}하라.
규칙: 내용·수치·인용·마크다운 구조를 보존한다. 새 사실을 만들지 않는다. ${dir === '확장' ? '기존 논지를 더 구체화해 늘린다.' : '중복·수식어를 걷어내 줄인다.'}
현재 약 ${len}자 → 목표 약 ${target}자(±${Math.round(target * TOL)}자). 조정된 텍스트만 출력(설명 금지).

${current}`;
        try {
            const result = await generateWithRetry(model, prompt);
            // FLASH가 개행을 리터럴 "\n" 문자열로 이스케이프해 반환하는 경우가 있어 정규화
            // (미정규화 시 본문이 마크다운 한 줄로 깨져 거대 헤더로 렌더됨 — 실측 버그).
            const out = (await result.response).text().trim().replace(/\\n/g, '\n').replace(/\\t/g, ' ');
            if (out.length > 0) current = out;
        } catch (e) {
            console.warn(`[LengthRepair] ${kind} 보정 실패(무시): ${e instanceof Error ? e.message : e}`);
            break;
        }
    }
    return current;
}

/**
 * 스레드 콘텐츠의 본문·시사점 길이를 창 안으로 보정.
 *   1) 시사점을 창 중앙(약 330자)으로.
 *   2) 본문(mainContent)을 "시사점/비율중앙"에서 역산한 목표로 → 비율까지 협응.
 * 이미 모두 창 안이면 호출을 생략(비용 절약).
 */
export async function repairThreadLengths(content: WeeklyThreadContent): Promise<WeeklyThreadContent> {
    let implications = content.implications;
    let mainContent = content.mainContent;
    const bgLen = charLen(content.background);

    // 1) 시사점 길이 보정
    const implTarget = clamp(330, LENGTH.IMPLICATION_MIN + 20, LENGTH.IMPLICATION_MAX - 20);
    if (charLen(implications) < LENGTH.IMPLICATION_MIN || charLen(implications) > LENGTH.IMPLICATION_MAX) {
        implications = await repairLength(implications, implTarget, '시사점');
    }

    // 2) 본문 목표 = 시사점/비율중앙, 창 안으로 clamp. mainContent 목표는 배경 제외.
    const bodyTarget = clamp(Math.round(charLen(implications) / TARGET_RATIO), LENGTH.BODY_MIN, LENGTH.BODY_MAX);
    const bodyLen = bgLen + charLen(mainContent);
    const ratio = bodyLen > 0 ? charLen(implications) / bodyLen : 0;
    const bodyOut = bodyLen < LENGTH.BODY_MIN || bodyLen > LENGTH.BODY_MAX;
    const ratioOut = ratio < LENGTH.IMPLICATION_RATIO_MIN || ratio > LENGTH.IMPLICATION_RATIO_MAX;
    if (bodyOut || ratioOut) {
        const mainTarget = Math.max(200, bodyTarget - bgLen);
        mainContent = await repairLength(mainContent, mainTarget, '본문(주요 내용)');
    }

    return { ...content, implications, mainContent };
}
