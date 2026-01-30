import { BriefReport } from '@/types';
import fs from 'fs/promises';
import path from 'path';
import { kv } from '@vercel/kv';

// 스토리지 인터페이스 정의
interface StorageAdapter {
    saveBrief(report: BriefReport): Promise<void>;
    getBriefByDate(date: string): Promise<BriefReport | null>;
    getLatestBrief(): Promise<BriefReport | null>;
    getAllBriefs(limit?: number): Promise<BriefReport[]>;
    deleteBrief(date: string): Promise<boolean>;
}

// 1. 파일 시스템 스토리지 (로컬 개발용)
class FileSystemStorage implements StorageAdapter {
    private dataDir: string;

    constructor() {
        this.dataDir = path.join(process.cwd(), 'data', 'briefs');
    }

    private async ensureDir() {
        try {
            await fs.access(this.dataDir);
        } catch {
            await fs.mkdir(this.dataDir, { recursive: true });
        }
    }

    async saveBrief(report: BriefReport): Promise<void> {
        await this.ensureDir();
        const filePath = path.join(this.dataDir, `${report.date}.json`);
        await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');
        console.log(`[File Store] 브리핑 저장 완료: ${filePath}`);
    }

    async getBriefByDate(date: string): Promise<BriefReport | null> {
        try {
            const filePath = path.join(this.dataDir, `${date}.json`);
            const data = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(data) as BriefReport;
        } catch {
            return null;
        }
    }

    async getLatestBrief(): Promise<BriefReport | null> {
        await this.ensureDir();
        try {
            const files = await fs.readdir(this.dataDir);
            const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();
            if (jsonFiles.length === 0) return null;

            const data = await fs.readFile(path.join(this.dataDir, jsonFiles[0]), 'utf-8');
            return JSON.parse(data) as BriefReport;
        } catch (error) {
            console.error('Failed to get latest brief:', error);
            return null;
        }
    }

    async getAllBriefs(limit = 30): Promise<BriefReport[]> {
        await this.ensureDir();
        try {
            const files = await fs.readdir(this.dataDir);
            const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse().slice(0, limit);

            const briefs = await Promise.all(
                jsonFiles.map(async (file) => {
                    const data = await fs.readFile(path.join(this.dataDir, file), 'utf-8');
                    return JSON.parse(data) as BriefReport;
                })
            );
            return briefs;
        } catch (error) {
            console.error('Failed to get all briefs:', error);
            return [];
        }
    }

    async deleteBrief(date: string): Promise<boolean> {
        try {
            const filePath = path.join(this.dataDir, `${date}.json`);
            await fs.unlink(filePath);
            console.log(`[File Store] 브리핑 삭제 완료: ${filePath}`);
            return true;
        } catch (error) {
            console.error(`[File Store] 브리핑 삭제 실패: ${date}`, error);
            return false;
        }
    }
}

// 2. Vercel KV 스토리지 (프로덕션 배포용)
class VercelKvStorage implements StorageAdapter {
    async saveBrief(report: BriefReport): Promise<void> {
        // 개별 브리핑 저장
        await kv.set(`brief:${report.date}`, report);
        // 날짜 인덱싱을 위한 Sorted Set 업데이트 (정렬 및 목록 조회용)
        // Score: 타임스탬프 (최신순 정렬을 위해), Member: 날짜 문자열
        const timestamp = new Date(report.date).getTime();
        await kv.zadd('briefs_index', { score: timestamp, member: report.date });
        console.log(`[KV Store] 브리핑 저장 완료: ${report.date}`);
    }

    async getBriefByDate(date: string): Promise<BriefReport | null> {
        return await kv.get<BriefReport>(`brief:${date}`);
    }

    async getLatestBrief(): Promise<BriefReport | null> {
        // 가장 최근 날짜 1개 가져오기
        const dates = await kv.zrange('briefs_index', 0, 0, { rev: true });
        if (dates.length === 0) return null;

        const latestDate = dates[0] as string;
        return await this.getBriefByDate(latestDate);
    }

    async getAllBriefs(limit = 30): Promise<BriefReport[]> {
        // 최신 날짜 목록 조회
        const dates = await kv.zrange('briefs_index', 0, limit - 1, { rev: true });
        if (dates.length === 0) return [];

        // 병렬로 데이터 가져오기 (mget 사용 가능하지만 키가 다르므로 Promise.all)
        // mget은 `brief:date1`, `brief:date2`... 키를 한번에 가져올 수 있음.
        const keys = dates.map(date => `brief:${date}`);
        if (keys.length === 0) return [];

        const briefs = await kv.mget<BriefReport[]>(...keys);
        return briefs.filter(Boolean) as BriefReport[];
    }

    async deleteBrief(date: string): Promise<boolean> {
        try {
            await kv.del(`brief:${date}`);
            await kv.zrem('briefs_index', date);
            console.log(`[KV Store] 브리핑 삭제 완료: ${date}`);
            return true;
        } catch (error) {
            console.error(`[KV Store] 브리핑 삭제 실패: ${date}`, error);
            return false;
        }
    }
}

// 환경에 따른 스토리지 선택 factory
function getStorage(): StorageAdapter {
    // Vercel KV 환경변수가 있으면 KV 사용, 아니면 로컬 파일 사용
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
        console.log('[Store] Vercel KV Storage 모드로 동작합니다.');
        return new VercelKvStorage();
    }
    console.log('[Store] Local File Storage 모드로 동작합니다.');
    return new FileSystemStorage();
}

const storage = getStorage();

export const saveBrief = (report: BriefReport) => storage.saveBrief(report);
export const getBriefByDate = (date: string) => storage.getBriefByDate(date);
export const getLatestBrief = () => storage.getLatestBrief();
export const getAllBriefs = (limit?: number) => storage.getAllBriefs(limit);
export const deleteBrief = (date: string) => storage.deleteBrief(date);

export function closeDb(): void {
    // no-op
}
