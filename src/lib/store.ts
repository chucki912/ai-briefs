import { BriefReport } from '@/types';
import fs from 'fs/promises';
import path from 'path';
import { kv } from '@vercel/kv';

// 스토리지 인터페이스 정의
// 스토리지 인터페이스 정의
interface StorageAdapter {
    saveBrief(report: BriefReport): Promise<void>;
    getBriefByDate(date: string): Promise<BriefReport | null>;
    getLatestBrief(): Promise<BriefReport | null>;
    getAllBriefs(limit?: number): Promise<BriefReport[]>;
    deleteBrief(date: string): Promise<boolean>;
    // Generic KV Operations for temporary jobs
    kvSet(key: string, value: any, ttlSeconds?: number): Promise<void>;
    kvGet<T>(key: string): Promise<T | null>;
}

// 1. 파일 시스템 스토리지 (로컬 개발용)
class FileSystemStorage implements StorageAdapter {
    private dataDir: string;
    private kvStore = new Map<string, { value: any, expiry: number }>();

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

    async kvSet(key: string, value: any, ttlSeconds?: number): Promise<void> {
        const expiry = ttlSeconds ? Date.now() + (ttlSeconds * 1000) : Infinity;
        this.kvStore.set(key, { value, expiry });
    }

    async kvGet<T>(key: string): Promise<T | null> {
        const item = this.kvStore.get(key);
        if (!item) return null;
        if (Date.now() > item.expiry) {
            this.kvStore.delete(key);
            return null;
        }
        return item.value as T;
    }
}

// 2. Vercel KV 스토리지 (프로덕션 배포용)
class VercelKvStorage implements StorageAdapter {
    async saveBrief(report: BriefReport): Promise<void> {
        // 개별 브리핑 저장 (90일 유지: 60s * 60m * 24h * 90d = 7776000)
        await kv.set(`brief:${report.date}`, report, { ex: 7776000 });

        // 날짜 인덱싱을 위한 Sorted Set 업데이트 (정렬 및 목록 조회용)
        const timestamp = new Date(report.date).getTime();
        await kv.zadd('briefs_index', { score: timestamp, member: report.date });
        console.log(`[KV Store] 브리핑 저장 완료 (90일 보관): ${report.date}`);
    }

    async getBriefByDate(date: string): Promise<BriefReport | null> {
        return await kv.get<BriefReport>(`brief:${date}`);
    }

    async getLatestBrief(): Promise<BriefReport | null> {
        const dates = await kv.zrange('briefs_index', 0, 0, { rev: true });
        if (dates.length === 0) return null;

        const latestDate = dates[0] as string;
        return await this.getBriefByDate(latestDate);
    }

    async getAllBriefs(limit = 30): Promise<BriefReport[]> {
        const dates = await kv.zrange('briefs_index', 0, limit - 1, { rev: true });
        if (dates.length === 0) return [];

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

    async kvSet(key: string, value: any, ttlSeconds?: number): Promise<void> {
        const opts = ttlSeconds ? { ex: ttlSeconds } : {};
        await kv.set(key, value, opts);
    }

    async kvGet<T>(key: string): Promise<T | null> {
        return await kv.get<T>(key);
    }
}

// 3. 인메모리 스토리지 (Vercel 배포 시 KV 미설정 상황 대비 Fallback)
class InMemoryStorage implements StorageAdapter {
    private store = new Map<string, BriefReport>();
    private kvStore = new Map<string, { value: any, expiry: number }>();

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

    async kvSet(key: string, value: any, ttlSeconds?: number): Promise<void> {
        const expiry = ttlSeconds ? Date.now() + (ttlSeconds * 1000) : Infinity;
        this.kvStore.set(key, { value, expiry });
    }

    async kvGet<T>(key: string): Promise<T | null> {
        const item = this.kvStore.get(key);
        if (!item) return null;
        if (Date.now() > item.expiry) {
            this.kvStore.delete(key);
            return null;
        }
        return item.value as T;
    }
}

import { createClient, RedisClientType } from 'redis';

// Redis Client Singleton
let redisClientInstance: RedisClientType | undefined;

async function getRedisClient(url: string) {
    if (redisClientInstance) return redisClientInstance;

    const isTls = url.startsWith('rediss://');
    const client = createClient({
        url: url,
        socket: isTls ? { tls: true, rejectUnauthorized: false } : undefined
    });

    client.on('error', (err) => console.error('[Redis Client Error]', err));

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
        await client.set(`brief:${report.date}`, JSON.stringify(report), { EX: 7776000 });
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
        const dates = await client.zRange('briefs_index', 0, limit - 1, { REV: true });
        if (dates.length === 0) return [];

        const keys = dates.map(date => `brief:${date}`);
        if (keys.length === 0) return [];

        const results = await client.mGet(keys);
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

    async kvSet(key: string, value: any, ttlSeconds?: number): Promise<void> {
        const client = await this.clientPromise;
        const opts = ttlSeconds ? { EX: ttlSeconds } : {};
        // Redis는 객체를 문자열로 직렬화해야 함
        const stringVal = JSON.stringify(value);
        await client.set(key, stringVal, opts);
    }

    async kvGet<T>(key: string): Promise<T | null> {
        const client = await this.clientPromise;
        const data = await client.get(key);
        return data ? JSON.parse(data) as T : null;
    }
}

// 환경에 따른 스토리지 선택 factory
function getStorage(): StorageAdapter {
    // 1. Vercel KV (전용 SDK 사용)
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
        return new VercelKvStorage();
    }

    // 2. 표준 Redis (KV_URL 또는 REDIS_URL)
    const redisUrl = process.env.KV_URL || process.env.REDIS_URL;
    if (redisUrl) {
        return new RedisStorage(redisUrl);
    }

    // 3. Fallback: 배포 환경이지만 설정 없음
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
        return new InMemoryStorage();
    }

    // 4. 로컬 개발 환경
    return new FileSystemStorage();
}

const storage = getStorage();

export const saveBrief = (report: BriefReport) => storage.saveBrief(report);
export const getBriefByDate = (date: string) => storage.getBriefByDate(date);
export const getLatestBrief = () => storage.getLatestBrief();
export const getAllBriefs = (limit?: number) => storage.getAllBriefs(limit);
export const deleteBrief = (date: string) => storage.deleteBrief(date);

// KV Helper Exports
export const kvSet = (key: string, value: any, ttl?: number) => storage.kvSet(key, value, ttl);
export const kvGet = <T>(key: string) => storage.kvGet<T>(key);

export function closeDb(): void {
    // 필요 시 연결 종료 로직 추가 가능
}
