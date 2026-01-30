import Database from 'better-sqlite3';
import path from 'path';
import { BriefReport, BriefRecord } from '@/types';

// 데이터베이스 경로
const DB_PATH = path.join(process.cwd(), 'data', 'briefs.db');

// 데이터베이스 연결
let db: Database.Database | null = null;

function getDb(): Database.Database {
    if (!db) {
        // data 디렉토리가 없으면 생성
        const fs = require('fs');
        const dataDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        db = new Database(DB_PATH);
        initializeDb();
    }
    return db;
}

// 테이블 초기화
function initializeDb() {
    const database = getDb();

    database.exec(`
    CREATE TABLE IF NOT EXISTS briefs (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      report TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_briefs_date ON briefs(date);
  `);
}

// 브리핑 저장
export function saveBrief(report: BriefReport): void {
    const database = getDb();

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

    // 90일 이상 된 데이터 삭제
    cleanupOldBriefs();
}

// 날짜로 브리핑 조회
export function getBriefByDate(date: string): BriefReport | null {
    const database = getDb();

    const stmt = database.prepare('SELECT * FROM briefs WHERE date = ?');
    const row = stmt.get(date) as BriefRecord | undefined;

    if (!row) return null;

    return JSON.parse(row.report) as BriefReport;
}

// 최신 브리핑 조회
export function getLatestBrief(): BriefReport | null {
    const database = getDb();

    const stmt = database.prepare('SELECT * FROM briefs ORDER BY date DESC LIMIT 1');
    const row = stmt.get() as BriefRecord | undefined;

    if (!row) return null;

    return JSON.parse(row.report) as BriefReport;
}

// 전체 브리핑 목록 조회 (아카이브용)
export function getAllBriefs(limit = 30): BriefReport[] {
    const database = getDb();

    const stmt = database.prepare('SELECT * FROM briefs ORDER BY date DESC LIMIT ?');
    const rows = stmt.all(limit) as BriefRecord[];

    return rows.map(row => JSON.parse(row.report) as BriefReport);
}

// 90일 이상 된 데이터 삭제
function cleanupOldBriefs(): void {
    const database = getDb();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    const stmt = database.prepare('DELETE FROM briefs WHERE date < ?');
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
