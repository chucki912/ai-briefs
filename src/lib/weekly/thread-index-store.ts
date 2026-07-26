/**
 * threadIndex 저장 추상화 (T3에서 backfill.ts로부터 분리)
 *
 * 백필과 live 런타임이 동일 인터페이스로 인덱스에 접근한다("실운영과 동일 코드 경로").
 *   - KV 구현: 프로덕션 영속. saveThreadIndex가 검증+add-only merge.
 *   - 인메모리 구현: dry-run 측정용. 주 간 누적을 재현해 matched/M1을 진짜로 측정하되
 *     프로덕션을 건드리지 않는다(mergeThreadIndex 동일 로직).
 */
import type { ThreadIndexEntry } from '@/types';
import {
    getAllThreadIndexes, getThreadIndex, saveThreadIndex, mergeThreadIndex,
} from '../thread-index';

export interface ThreadIndexStore {
    getAll(): Promise<ThreadIndexEntry[]>;
    get(threadKey: string): Promise<ThreadIndexEntry | null>;
    save(entry: ThreadIndexEntry): Promise<void>;
}

export const kvThreadIndexStore: ThreadIndexStore = {
    getAll: () => getAllThreadIndexes(),
    get: (k) => getThreadIndex(k),
    save: async (e) => { await saveThreadIndex(e); },
};

export class InMemoryThreadIndexStore implements ThreadIndexStore {
    private map = new Map<string, ThreadIndexEntry>();
    async getAll() { return Array.from(this.map.values()); }
    async get(threadKey: string) { return this.map.get(threadKey) ?? null; }
    async save(entry: ThreadIndexEntry) {
        this.map.set(entry.threadKey, mergeThreadIndex(this.map.get(entry.threadKey) ?? null, entry));
    }
}
