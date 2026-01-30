'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import IssueCard from '@/components/IssueCard';
import { BriefReport } from '@/types';

interface BriefSummary {
    id: string;
    date: string;
    dayOfWeek: string;
    totalIssues: number;
    generatedAt: string;
}

export default function ArchivePage() {
    const [briefs, setBriefs] = useState<BriefSummary[]>([]);
    const [selectedBrief, setSelectedBrief] = useState<BriefReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingDetail, setLoadingDetail] = useState(false);

    // 브리핑 목록 로드
    useEffect(() => {
        async function loadBriefs() {
            try {
                const res = await fetch('/api/brief?list=true');
                const data = await res.json();

                if (data.success) {
                    setBriefs(data.data);
                }
            } catch (err) {
                console.error('Failed to load briefs:', err);
            } finally {
                setLoading(false);
            }
        }

        loadBriefs();
    }, []);

    // 특정 날짜 브리핑 로드
    const loadBriefDetail = async (date: string) => {
        try {
            setLoadingDetail(true);
            const res = await fetch(`/api/brief?date=${date}`);
            const data = await res.json();

            if (data.success) {
                setSelectedBrief(data.data);
            }
        } catch (err) {
            console.error('Failed to load brief detail:', err);
        } finally {
            setLoadingDetail(false);
        }
    };

    const formatDate = (dateStr: string) => {
        const [year, month, day] = dateStr.split('-');
        return `${year}년 ${parseInt(month)}월 ${parseInt(day)}일`;
    };

    return (
        <div className="container">
            {/* Header */}
            <header className="header">
                <Link href="/" className="logo">
                    🤖 AI Daily Brief
                </Link>
                <nav className="nav">
                    <Link href="/" className="nav-link">
                        오늘의 브리핑
                    </Link>
                    <ThemeToggle />
                </nav>
            </header>

            {/* Main Content */}
            <main>
                <h1 style={{ marginBottom: '2rem', fontSize: '1.5rem' }}>
                    📚 브리핑 아카이브
                </h1>

                {loading ? (
                    <div className="loading">
                        <div className="spinner" />
                        <span>아카이브를 불러오는 중...</span>
                    </div>
                ) : selectedBrief ? (
                    <>
                        {/* Back Button */}
                        <button
                            className="btn btn-secondary"
                            onClick={() => setSelectedBrief(null)}
                            style={{ marginBottom: '1.5rem' }}
                        >
                            ← 목록으로 돌아가기
                        </button>

                        {/* Brief Detail */}
                        <div className="brief-header">
                            <div className="brief-date">
                                {formatDate(selectedBrief.date)} ({selectedBrief.dayOfWeek})
                            </div>
                            <div className="brief-title">
                                LLM이 찾아주는 데일리 AI 이슈 by Chuck Choi
                            </div>
                            <div className="brief-meta">
                                총 {selectedBrief.totalIssues}개 이슈
                            </div>
                        </div>

                        {selectedBrief.issues.map((issue, index) => (
                            <IssueCard key={index} issue={issue} index={index} />
                        ))}
                    </>
                ) : briefs.length > 0 ? (
                    <ul className="archive-list">
                        {briefs.map((brief) => (
                            <li key={brief.id}>
                                <a
                                    href="#"
                                    className="archive-item"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        loadBriefDetail(brief.date);
                                    }}
                                >
                                    <span className="archive-date">
                                        {formatDate(brief.date)} ({brief.dayOfWeek})
                                    </span>
                                    <span className="archive-meta">
                                        {brief.totalIssues}개 이슈
                                    </span>
                                </a>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="empty-state">
                        <div className="empty-icon">📂</div>
                        <h2 className="empty-title">아직 저장된 브리핑이 없습니다</h2>
                        <p className="empty-description">
                            브리핑이 생성되면 여기에 자동으로 보관됩니다.
                        </p>
                        <Link href="/" className="btn">
                            오늘의 브리핑 보기
                        </Link>
                    </div>
                )}

                {loadingDetail && (
                    <div className="loading">
                        <div className="spinner" />
                        <span>브리핑을 불러오는 중...</span>
                    </div>
                )}
            </main>

            {/* Footer */}
            <footer className="footer">
                <p>© 2026 AI Daily Brief. 90일간 보관</p>
            </footer>
        </div>
    );
}
