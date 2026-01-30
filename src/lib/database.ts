import { BriefReport } from '@/types';

// Vercel 환경 감지
const isVercel = process.env.VERCEL === '1';

// 인메모리 저장소 (Vercel용)
const memoryStore = new Map<string, BriefReport>();

// SQLite 관련 (로컬용)
let db: import('better-sqlite3').Database | null = null;

async function getDb() {
    if (isVercel) {
        return null; // Vercel에서는 SQLite 사용 안 함
    }

    if (!db) {
        const Database = (await import('better-sqlite3')).default;
        const path = await import('path');
        const fs = await import('fs');

        const DB_PATH = path.join(process.cwd(), 'data', 'briefs.db');
        const dataDir = path.dirname(DB_PATH);

        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        db = new Database(DB_PATH);

        db.exec(`
      CREATE TABLE IF NOT EXISTS briefs (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        report TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_briefs_date ON briefs(date);
    `);
    }
    return db;
}

// 브리핑 저장
export async function saveBrief(report: BriefReport): Promise<void> {
    if (isVercel) {
        // Vercel: 인메모리 저장
        memoryStore.set(report.date, report);
        console.log(`[Memory Store] 브리핑 저장 완료: ${report.date}`);
    } else {
        // 로컬: SQLite 저장
        const database = await getDb();
        if (!database) return;

        const stmt = database.prepare(`
      INSERT OR REPLACE INTO briefs (id, date, report, created_at)
      VALUES (?, ?, ?, ?)
    `);

        stmt.run(
            report.id,
            report.date,
            JSON.stringify(report),
            report.generatedAt
        );

        console.log(`[DB] 브리핑 저장 완료: ${report.date}`);
        cleanupOldBriefs();
    }
}

// 날짜로 브리핑 조회
export async function getBriefByDate(date: string): Promise<BriefReport | null> {
    if (isVercel) {
        return memoryStore.get(date) || null;
    }

    const database = await getDb();
    if (!database) return null;

    const stmt = database.prepare('SELECT * FROM briefs WHERE date = ?');
    const row = stmt.get(date) as { report: string } | undefined;

    if (!row) return null;
    return JSON.parse(row.report) as BriefReport;
}

// 최신 브리핑 조회
export async function getLatestBrief(): Promise<BriefReport | null> {
    if (isVercel) {
        const dates = Array.from(memoryStore.keys()).sort().reverse();
        return dates.length > 0 ? memoryStore.get(dates[0])! : null;
    }

    const database = await getDb();
    if (!database) return null;

    const stmt = database.prepare('SELECT * FROM briefs ORDER BY date DESC LIMIT 1');
    const row = stmt.get() as { report: string } | undefined;

    if (!row) return null;
    return JSON.parse(row.report) as BriefReport;
}

// 전체 브리핑 목록 조회 (아카이브용)
export async function getAllBriefs(limit = 30): Promise<BriefReport[]> {
    if (isVercel) {
        const dates = Array.from(memoryStore.keys()).sort().reverse().slice(0, limit);
        return dates.map(date => memoryStore.get(date)!);
    }

    const database = await getDb();
    if (!database) return [];

    const stmt = database.prepare('SELECT * FROM briefs ORDER BY date DESC LIMIT ?');
    const rows = stmt.all(limit) as { report: string }[];

    return rows.map(row => JSON.parse(row.report) as BriefReport);
}

// 90일 이상 된 데이터 삭제 (로컬 전용)
function cleanupOldBriefs(): void {
    if (isVercel || !db) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    const stmt = db.prepare('DELETE FROM briefs WHERE date < ?');
    const result = stmt.run(cutoffStr);

    if (result.changes > 0) {
        console.log(`[DB] ${result.changes}개의 오래된 브리핑 삭제됨`);
    }
}

// 데이터베이스 연결 종료
export function closeDb(): void {
    if (db) {
        db.close();
        db = null;
    }
}
