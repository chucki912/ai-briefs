import { BriefReport } from '@/types';

// 인메모리 저장소
const memoryStore = new Map<string, BriefReport>();

// 브리핑 저장
export async function saveBrief(report: BriefReport): Promise<void> {
    memoryStore.set(report.date, report);
    console.log(`[Memory Store] 브리핑 저장 완료: ${report.date}`);
}

// 날짜로 브리핑 조회
export async function getBriefByDate(date: string): Promise<BriefReport | null> {
    return memoryStore.get(date) || null;
}

// 최신 브리핑 조회
export async function getLatestBrief(): Promise<BriefReport | null> {
    const dates = Array.from(memoryStore.keys()).sort().reverse();
    return dates.length > 0 ? memoryStore.get(dates[0])! : null;
}

// 전체 브리핑 목록 조회 (아카이브용)
export async function getAllBriefs(limit = 30): Promise<BriefReport[]> {
    const dates = Array.from(memoryStore.keys()).sort().reverse().slice(0, limit);
    return dates.map(date => memoryStore.get(date)!);
}

// 데이터베이스 연결 종료 (호환성 유지)
export function closeDb(): void {
    // 인메모리 사용으로 별도 관리 불필요
}
