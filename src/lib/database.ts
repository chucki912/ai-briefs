import { BriefReport } from '@/types';

// Vercel 환경 감지 (여러 방법으로 체크)
const isVercel = !!(process.env.VERCEL || process.env.VERCEL_ENV || process.env.VERCEL_URL);

console.log('[Database] 환경:', isVercel ? 'Vercel (인메모리)' : '로컬 (SQLite)');

// 인메모리 저장소 (Vercel용)
const memoryStore = new Map<string, BriefReport>();

// 브리핑 저장
export async function saveBrief(report: BriefReport): Promise<void> {
    if (isVercel) {
        // Vercel: 인메모리 저장
        memoryStore.set(report.date, report);
        console.log(`[Memory Store] 브리핑 저장 완료: ${report.date}`);
        return;
    }

    // 로컬: SQLite 저장
    try {
        const Database = (await import('better-sqlite3')).default;
        const path = await import('path');
        const fs = await import('fs');

        const DB_PATH = path.join(process.cwd(), 'data', 'briefs.db');
        const dataDir = path.dirname(DB_PATH);

        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        const db = new Database(DB_PATH);

        db.exec(`
      CREATE TABLE IF NOT EXISTS briefs (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        report TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

        const stmt = db.prepare(`
      INSERT OR REPLACE INTO briefs (id, date, report, created_at)
      VALUES (?, ?, ?, ?)
    `);

        stmt.run(
            report.id,
            report.date,
            JSON.stringify(report),
            report.generatedAt
        );

        db.close();
        console.log(`[DB] 브리핑 저장 완료: ${report.date}`);
    } catch (error) {
        console.error('[DB Error] SQLite 저장 실패, 인메모리로 폴백:', error);
        memoryStore.set(report.date, report);
    }
}

// 날짜로 브리핑 조회
export async function getBriefByDate(date: string): Promise<BriefReport | null> {
    if (isVercel) {
        return memoryStore.get(date) || null;
    }

    try {
        const Database = (await import('better-sqlite3')).default;
        const path = await import('path');
        const fs = await import('fs');

        const DB_PATH = path.join(process.cwd(), 'data', 'briefs.db');

        if (!fs.existsSync(DB_PATH)) {
            return null;
        }

        const db = new Database(DB_PATH);
        const stmt = db.prepare('SELECT * FROM briefs WHERE date = ?');
        const row = stmt.get(date) as { report: string } | undefined;
        db.close();

        if (!row) return null;
        return JSON.parse(row.report) as BriefReport;
    } catch (error) {
        console.error('[DB Error] SQLite 조회 실패:', error);
        return memoryStore.get(date) || null;
    }
}

// 최신 브리핑 조회
export async function getLatestBrief(): Promise<BriefReport | null> {
    if (isVercel) {
        const dates = Array.from(memoryStore.keys()).sort().reverse();
        return dates.length > 0 ? memoryStore.get(dates[0])! : null;
    }

    try {
        const Database = (await import('better-sqlite3')).default;
        const path = await import('path');
        const fs = await import('fs');

        const DB_PATH = path.join(process.cwd(), 'data', 'briefs.db');

        if (!fs.existsSync(DB_PATH)) {
            return null;
        }

        const db = new Database(DB_PATH);
        const stmt = db.prepare('SELECT * FROM briefs ORDER BY date DESC LIMIT 1');
        const row = stmt.get() as { report: string } | undefined;
        db.close();

        if (!row) return null;
        return JSON.parse(row.report) as BriefReport;
    } catch (error) {
        console.error('[DB Error] SQLite 조회 실패:', error);
        const dates = Array.from(memoryStore.keys()).sort().reverse();
        return dates.length > 0 ? memoryStore.get(dates[0])! : null;
    }
}

// 전체 브리핑 목록 조회 (아카이브용)
export async function getAllBriefs(limit = 30): Promise<BriefReport[]> {
    if (isVercel) {
        const dates = Array.from(memoryStore.keys()).sort().reverse().slice(0, limit);
        return dates.map(date => memoryStore.get(date)!);
    }

    try {
        const Database = (await import('better-sqlite3')).default;
        const path = await import('path');
        const fs = await import('fs');

        const DB_PATH = path.join(process.cwd(), 'data', 'briefs.db');

        if (!fs.existsSync(DB_PATH)) {
            return [];
        }

        const db = new Database(DB_PATH);
        const stmt = db.prepare('SELECT * FROM briefs ORDER BY date DESC LIMIT ?');
        const rows = stmt.all(limit) as { report: string }[];
        db.close();

        return rows.map(row => JSON.parse(row.report) as BriefReport);
    } catch (error) {
        console.error('[DB Error] SQLite 조회 실패:', error);
        const dates = Array.from(memoryStore.keys()).sort().reverse().slice(0, limit);
        return dates.map(date => memoryStore.get(date)!);
    }
}

// 데이터베이스 연결 종료 (호환성 유지)
export function closeDb(): void {
    // 인메모리나 동적 import 사용으로 별도 관리 불필요
}
