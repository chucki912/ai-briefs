import { BriefReport, IssueItem } from '@/types';
import fs from 'fs/promises';
import path from 'path';
import { kv } from '@vercel/kv';

// 스토리지 인터페이스 정의
export interface StorageAdapter {
    saveBrief(report: BriefReport): Promise<void>;
    getBriefByDate(date: string): Promise<BriefReport | null>;
    getLatestBrief(): Promise<BriefReport | null>;
    getAllBriefs(limit?: number): Promise<BriefReport[]>;
    deleteBrief(date: string): Promise<boolean>;
    // Generic KV Operations for temporary jobs
    getRecentIssues(days?: number, domain?: 'ai' | 'battery'): Promise<IssueItem[]>;
    getIssuesByDateRange(startDate: Date, endDate: Date): Promise<IssueItem[]>;
    kvSet(key: string, value: any, ttlSeconds?: number): Promise<void>;
    kvGet<T>(key: string): Promise<T | null>;
    // Activity Logging
    saveLog(log: ActivityLog): Promise<void>;
    getLogs(limit?: number): Promise<ActivityLog[]>;
}

export interface ActivityLog {
    id: string; // UUID
    timestamp: number;
    action: 'VIEW_BRIEF' | 'CLICK_ISSUE' | 'SHARE_ISSUE' | 'GENERATE_TREND_REPORT' | 'CLICK_SOURCE' | 'VIEW_TREND_REPORT';
    targetId: string; // e.g., "2024-02-07" or "issue_hash"
    metadata?: Record<string, any>;
    userAgent?: string;
    ip?: string;
}

// 1. 파일 시스템 스토리지 (로컬 개발용)
class FileSystemStorage implements StorageAdapter {
    private dataDir: string;
    private kvDir: string;
    private logDir: string;

    constructor() {
        this.dataDir = path.join(process.cwd(), 'data', 'briefs');
        this.kvDir = path.join(process.cwd(), 'data', 'kv');
        this.logDir = path.join(process.cwd(), 'data', 'logs');
    }

    private async ensureDir() {
        try { await fs.access(this.dataDir); } catch { await fs.mkdir(this.dataDir, { recursive: true }); }
        try { await fs.access(this.kvDir); } catch { await fs.mkdir(this.kvDir, { recursive: true }); }
        try { await fs.access(this.logDir); } catch { await fs.mkdir(this.logDir, { recursive: true }); }
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

    async getRecentIssues(days = 3, domain: 'ai' | 'battery' = 'ai'): Promise<IssueItem[]> {
        await this.ensureDir();
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            const cutoffDateStr = cutoffDate.toISOString().split('T')[0]; // YYYY-MM-DD

            const files = await fs.readdir(this.dataDir);
            const recentBriefFiles = files
                .filter(f => f.endsWith('.json'))
                .filter(f => {
                    const fileName = f.replace('.json', '');
                    const isBatteryFile = fileName.startsWith('battery-');
                    const fileDateOnly = isBatteryFile ? fileName.replace('battery-', '') : fileName;

                    // 1. Domain filtering
                    if (domain === 'battery' && !isBatteryFile) return false;
                    if (domain === 'ai' && isBatteryFile) return false;

                    // 2. Date filtering
                    return fileDateOnly >= cutoffDateStr;
                })
                .sort()
                .reverse();

            const briefs = await Promise.all(
                recentBriefFiles.map(async (file) => {
                    const data = await fs.readFile(path.join(this.dataDir, file), 'utf-8');
                    return JSON.parse(data) as BriefReport;
                })
            );

            return briefs.flatMap(b => b.issues);
        } catch (error) {
            console.error('Failed to get recent issues from FileSystem:', error);
            return [];
        }
    }

    async getIssuesByDateRange(startDate: Date, endDate: Date): Promise<IssueItem[]> {
        await this.ensureDir();
        try {
            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];

            const files = await fs.readdir(this.dataDir);
            const targetFiles = files
                .filter(f => f.endsWith('.json'))
                .filter(f => {
                    const fileDate = f.replace('.json', '');
                    return fileDate >= startStr && fileDate <= endStr;
                })
                .sort();

            const briefs = await Promise.all(
                targetFiles.map(async (file) => {
                    const data = await fs.readFile(path.join(this.dataDir, file), 'utf-8');
                    return JSON.parse(data) as BriefReport;
                })
            );

            return briefs.flatMap(b => b.issues);
        } catch (error) {
            console.error('Failed to get issues by date range from FileSystem:', error);
            return [];
        }
    }

    async kvSet(key: string, value: any, ttlSeconds?: number): Promise<void> {
        await this.ensureDir();
        const safeKey = key.replace(/:/g, '_');
        const filePath = path.join(this.kvDir, `${safeKey}.json`);

        const data = {
            value,
            expiry: ttlSeconds ? Date.now() + (ttlSeconds * 1000) : Infinity
        };

        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    }

    async kvGet<T>(key: string): Promise<T | null> {
        const safeKey = key.replace(/:/g, '_');
        const filePath = path.join(this.kvDir, `${safeKey}.json`);

        try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(fileContent);

            if (Date.now() > data.expiry) {
                await fs.unlink(filePath).catch(() => { });
                return null;
            }
            return data.value as T;
        } catch {
            return null;
        }
    }

    async saveLog(log: ActivityLog): Promise<void> {
        await this.ensureDir();
        // 일별 로그 파일: logs/2024-02-07.jsonl (line-delimited JSON)
        const dateStr = new Date(log.timestamp).toISOString().split('T')[0];
        const filePath = path.join(this.logDir, `${dateStr}.jsonl`);
        // Append log line
        await fs.appendFile(filePath, JSON.stringify(log) + '\n', 'utf-8');
    }

    async getLogs(limit = 100): Promise<ActivityLog[]> {
        // 최근 로그 파일부터 읽어서 limit만큼 반환하는 로직 (간소화)
        // 실제로는 최근 파일들을 역순으로 읽어야 함
        await this.ensureDir();
        try {
            const files = await fs.readdir(this.logDir);
            const logFiles = files.filter(f => f.endsWith('.jsonl')).sort().reverse();

            const logs: ActivityLog[] = [];
            for (const file of logFiles) {
                if (logs.length >= limit) break;
                const content = await fs.readFile(path.join(this.logDir, file), 'utf-8');
                const lines = content.split('\n').filter(Boolean).reverse(); // 최신순
                for (const line of lines) {
                    if (logs.length >= limit) break;
                    try {
                        logs.push(JSON.parse(line));
                    } catch { }
                }
            }
            return logs;
        } catch {
            return [];
        }
    }
}

// 2. Vercel KV 스토리지 (프로덕션 배포용)
class VercelKvStorage implements StorageAdapter {
    async getRecentIssues(days = 3, domain: 'ai' | 'battery' = 'ai'): Promise<IssueItem[]> {
        // Calculate date range
        const dates: string[] = [];
        for (let i = 0; i < days; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            dates.push(domain === 'battery' ? `battery-${dateStr}` : dateStr);
        }

        try {
            // Fetch all briefs in parallel
            const keys = dates.map(date => `brief:${date}`);
            const briefs = await kv.mget<BriefReport[]>(...keys);

            return briefs
                .filter((b): b is BriefReport => b !== null)
                .flatMap(b => b.issues);
        } catch (error) {
            console.error('Failed to get recent issues from KV:', error);
            return [];
        }
    }

    async getIssuesByDateRange(startDate: Date, endDate: Date): Promise<IssueItem[]> {
        const dates: string[] = [];
        let current = new Date(startDate);
        const end = new Date(endDate);

        while (current <= end) {
            dates.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
        }

        try {
            const keys = dates.map(date => `brief:${date}`);
            // Vercel KV mget limits might apply, but for typical ranges (30 days) it should be fine.
            const briefs = await kv.mget<BriefReport[]>(...keys);

            return briefs
                .filter((b): b is BriefReport => b !== null)
                .flatMap(b => b.issues);
        } catch (error) {
            console.error('Failed to get issues by date range from KV:', error);
            return [];
        }
    }

    async saveBrief(report: BriefReport): Promise<void> {
        // 개별 브리핑 저장 (90일 유지: 60s * 60m * 24h * 90d = 7776000)
        await kv.set(`brief:${report.date}`, report, { ex: 7776000 });

        // 날짜 인덱싱을 위한 Sorted Set 업데이트 (정렬 및 목록 조회용)
        const timestamp = new Date(report.date).getTime();
        await kv.zadd('briefs_index', { score: timestamp, member: report.date });
        console.log(`[KV Store] 브리핑 저장 완료(90일 보관): ${report.date}`);
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

    async saveLog(log: ActivityLog): Promise<void> {
        // 1. 로그 상세 저장 (30일 보관)
        const key = `log:${log.timestamp}:${log.id}`;
        await kv.set(key, log, { ex: 2592000 }); // 30 days

        // 2. 인덱싱 (Timestamp Score)
        await kv.zadd('logs_index', { score: log.timestamp, member: key });
    }

    async getLogs(limit = 100): Promise<ActivityLog[]> {
        // 최신순 조회
        const keys = await kv.zrange('logs_index', 0, limit - 1, { rev: true });
        if (keys.length === 0) return [];

        // MGET으로 로그 상세 조회 (string[]으로 반환됨을 고려)
        const logs = await kv.mget<(ActivityLog | null)[]>(...keys as string[]);
        return logs.filter((log): log is ActivityLog => log !== null);
    }
}

// 3. 인메모리 스토리지 (Vercel 배포 시 KV 미설정 상황 대비 Fallback)
class InMemoryStorage implements StorageAdapter {
    private store = new Map<string, BriefReport>();
    private kvStore = new Map<string, { value: any, expiry: number }>();

    async getRecentIssues(days = 3, domain: 'ai' | 'battery' = 'ai'): Promise<IssueItem[]> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

        const recentBriefs = Array.from(this.store.values())
            .filter(b => {
                const isBattery = b.date.startsWith('battery-');
                const dateOnly = isBattery ? b.date.replace('battery-', '') : b.date;

                if (domain === 'battery' && !isBattery) return false;
                if (domain === 'ai' && isBattery) return false;

                return dateOnly >= cutoffDateStr;
            });

        return recentBriefs.flatMap(b => b.issues);
    }

    async getIssuesByDateRange(startDate: Date, endDate: Date): Promise<IssueItem[]> {
        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        const rangeBriefs = Array.from(this.store.values())
            .filter(b => b.date >= startStr && b.date <= endStr);

        return rangeBriefs.flatMap(b => b.issues);
    }

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

    private logs: ActivityLog[] = [];

    async saveLog(log: ActivityLog): Promise<void> {
        this.logs.unshift(log); // 최신순
        // 메모리 관리: 1000개까지만 유지
        if (this.logs.length > 1000) this.logs.pop();
    }

    async getLogs(limit = 100): Promise<ActivityLog[]> {
        return this.logs.slice(0, limit);
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

    async getRecentIssues(days = 3, domain: 'ai' | 'battery' = 'ai'): Promise<IssueItem[]> {
        const client = await this.clientPromise;

        // Calculate date range
        const dates: string[] = [];
        for (let i = 0; i < days; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            dates.push(domain === 'battery' ? `battery-${dateStr}` : dateStr);
        }

        try {
            const keys = dates.map(date => `brief:${date}`);
            const results = await client.mGet(keys);

            return results
                .filter((item): item is string => item !== null)
                .map(item => JSON.parse(item) as BriefReport)
                .flatMap(b => b.issues);
        } catch (error) {
            console.error('Failed to get recent issues from Redis:', error);
            return [];
        }
    }

    async getIssuesByDateRange(startDate: Date, endDate: Date): Promise<IssueItem[]> {
        const client = await this.clientPromise;

        const dates: string[] = [];
        let current = new Date(startDate);
        const end = new Date(endDate);

        while (current <= end) {
            dates.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
        }

        try {
            const keys = dates.map(date => `brief:${date}`);
            const results = await client.mGet(keys);

            return results
                .filter((item): item is string => item !== null)
                .map(item => JSON.parse(item) as BriefReport)
                .flatMap(b => b.issues);
        } catch (error) {
            console.error('Failed to get issues by date range from Redis:', error);
            return [];
        }
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

    async saveLog(log: ActivityLog): Promise<void> {
        const client = await this.clientPromise;
        const key = `log:${log.timestamp}:${log.id}`;

        // Transaction to ensure atomicity
        await client.multi()
            .set(key, JSON.stringify(log), { EX: 2592000 }) // 30 days
            .zAdd('logs_index', { score: log.timestamp, value: key })
            .exec();
    }

    async getLogs(limit = 100): Promise<ActivityLog[]> {
        const client = await this.clientPromise;
        const keys = await client.zRange('logs_index', 0, limit - 1, { REV: true });
        if (keys.length === 0) return [];

        const logs = await client.mGet(keys);
        return logs
            .filter((log): log is string => log !== null)
            .map(log => JSON.parse(log) as ActivityLog);
    }
}

// 환경에 따른 스토리지 선택 factory
export function getStorage(): StorageAdapter {
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
export const getRecentIssues = (days?: number, domain?: 'ai' | 'battery') => storage.getRecentIssues(days, domain);
export const getIssuesByDateRange = (startDate: Date, endDate: Date) => storage.getIssuesByDateRange(startDate, endDate);

// KV Helper Exports
export const kvSet = (key: string, value: any, ttl?: number) => storage.kvSet(key, value, ttl);
export const kvGet = <T>(key: string) => storage.kvGet<T>(key);

// Logging Exports
export const saveLog = (log: ActivityLog) => storage.saveLog(log);
export const getLogs = (limit?: number) => storage.getLogs(limit);

export function closeDb(): void {
    // 필요 시 연결 종료 로직 추가 가능
}
