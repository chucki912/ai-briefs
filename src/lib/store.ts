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
        // 개별 브리핑 저장 (90일 유지: 60s * 60m * 24h * 90d = 7776000)
        await kv.set(`brief:${report.date}`, report, { ex: 7776000 });

        // 날짜 인덱싱을 위한 Sorted Set 업데이트 (정렬 및 목록 조회용)
        // Score: 타임스탬프 (최신순 정렬을 위해), Member: 날짜 문자열
        const timestamp = new Date(report.date).getTime();
        await kv.zadd('briefs_index', { score: timestamp, member: report.date });
        console.log(`[KV Store] 브리핑 저장 완료 (90일 보관): ${report.date}`);
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

// 3. 인메모리 스토리지 (Vercel 배포 시 KV 미설정 상황 대비 Fallback)
class InMemoryStorage implements StorageAdapter {
    private store = new Map<string, BriefReport>();

    async saveBrief(report: BriefReport): Promise<void> {
        this.store.set(report.date, report);
        console.log(`[Memory Store] 브리핑 저장 완료: ${report.date}`);
    }

    async getBriefByDate(date: string): Promise<BriefReport | null> {
        return this.store.get(date) || null;
    }

    async getLatestBrief(): Promise<BriefReport | null> {
        const dates = Array.from(this.store.keys()).sort().reverse();
        return dates.length > 0 ? this.store.get(dates[0])! : null;
    }

    async getAllBriefs(limit = 30): Promise<BriefReport[]> {
        const dates = Array.from(this.store.keys()).sort().reverse().slice(0, limit);
        return dates.map(date => this.store.get(date)!);
    }

    async deleteBrief(date: string): Promise<boolean> {
        return this.store.delete(date);
    }
}

import { createClient, RedisClientType } from 'redis';

// Redis Client Singleton (for Next.js Hot Reload)
let redisClientInstance: RedisClientType | undefined;

async function getRedisClient(url: string) {
    if (redisClientInstance) return redisClientInstance;

    const isTls = url.startsWith('rediss://');
    const client = createClient({
        url: url,
        socket: isTls ? {
            tls: true,
            rejectUnauthorized: false
        } : undefined
    });

    client.on('error', (err) => console.error('[Redis Client Error]', err));

    // User's preferred pattern: await connect()
    // We attach it to the global scope in dev to prevent multiple instances
    if (process.env.NODE_ENV !== 'production') {
        if (!global.redisGlobal) {
            await client.connect();
            global.redisGlobal = client;
        }
        redisClientInstance = global.redisGlobal as RedisClientType;
    } else {
        await client.connect();
        redisClientInstance = client as RedisClientType;
    }

    return redisClientInstance;
}

// Global declaration for TypeScript
declare global {
    var redisGlobal: unknown;
}

// 4. Redis Client 스토리지 (표준 Redis용)
class RedisStorage implements StorageAdapter {
    private clientPromise: Promise<RedisClientType>;

    constructor(url: string) {
        this.clientPromise = getRedisClient(url);
    }

    async saveBrief(report: BriefReport): Promise<void> {
        const client = await this.clientPromise;
        // 개별 브리핑 저장 (90일 유지)
        await client.set(`brief:${report.date}`, JSON.stringify(report), { EX: 7776000 });

        // 정렬용 인덱스
        const timestamp = new Date(report.date).getTime();
        await client.zAdd('briefs_index', { score: timestamp, value: report.date });
        console.log(`[Redis] 브리핑 저장 완료: ${report.date}`);
    }

    async getBriefByDate(date: string): Promise<BriefReport | null> {
        const client = await this.clientPromise;
        const data = await client.get(`brief:${date}`);
        return data ? JSON.parse(data) : null;
    }

    async getLatestBrief(): Promise<BriefReport | null> {
        const client = await this.clientPromise;
        const list = await client.zRange('briefs_index', 0, 0, { REV: true });
        if (list.length === 0) return null;
        return this.getBriefByDate(list[0]);
    }

    async getAllBriefs(limit = 30): Promise<BriefReport[]> {
        const client = await this.clientPromise;
        // 인덱스 조회
        const dates = await client.zRange('briefs_index', 0, limit - 1, { REV: true });
        if (dates.length === 0) return [];

        // MGET을 위한 키 생성
        const keys = dates.map(date => `brief:${date}`);
        if (keys.length === 0) return [];

        const results = await client.mGet(keys);

        // null 제외하고 파싱
        return results
            .filter((item): item is string => item !== null)
            .map(item => JSON.parse(item) as BriefReport);
    }

    async deleteBrief(date: string): Promise<boolean> {
        const client = await this.clientPromise;
        try {
            await client.del(`brief:${date}`);
            await client.zRem('briefs_index', date);
            console.log(`[Redis] 브리핑 삭제 완료: ${date}`);
            return true;
        } catch (error) {
            console.error(`[Redis] 브리핑 삭제 실패: ${date}`, error);
            return false;
        }
    }
}

// 환경에 따른 스토리지 선택 factory
function getStorage(): StorageAdapter {
    // 1. Vercel KV (전용 SDK 사용)
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
        console.log('[Store] Vercel KV Storage 모드로 동작합니다.');
        return new VercelKvStorage();
    }

    // 2. 표준 Redis (KV_URL 또는 REDIS_URL)
    const redisUrl = process.env.KV_URL || process.env.REDIS_URL;
    if (redisUrl) {
        console.log('[Store] Standard Redis Storage 모드로 동작합니다.');
        return new RedisStorage(redisUrl);
    }

    // 3. Fallback: Vercel 환경이지만 설정 없는 경우
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
        console.warn('⚠️ [Store] Vercel 환경이 감지되었으나 KV 설정이 없습니다.');
        console.warn('⚠️ [Store] InMemoryStorage로 전환합니다. (서버 재시작 시 데이터가 초기화됩니다)');
        return new InMemoryStorage();
    }

    // 4. 로컬 개발 환경
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
    // 필요 시 연결 종료 로직 추가 가능
}
