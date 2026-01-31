'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import IssueCard from '@/components/IssueCard';
import TrendReportModal from '@/components/TrendReportModal';
import { BriefReport, IssueItem } from '@/types';

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

    // Trend Report State
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [reportContent, setReportContent] = useState('');
    const [reportLoading, setReportLoading] = useState(false);

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

    // 브리핑 삭제
    const handleDelete = async (date: string) => {
        try {
            const res = await fetch(`/api/brief?date=${date}`, {
                method: 'DELETE',
            });
            const data = await res.json();

            if (data.success) {
                alert('브리핑이 삭제되었습니다.');
                setSelectedBrief(null);
                // 목록 갱신 reload
                const listRes = await fetch('/api/brief?list=true');
                const listData = await listRes.json();
                if (listData.success) {
                    setBriefs(listData.data);
                }
            } else {
                alert(data.error || '삭제 실패');
            }
        } catch (err) {
            console.error('Failed to delete brief:', err);
            alert('삭제 중 오류 발생');
        }
    };

    // 트렌드 리포트 생성 (Deep Dive)
    const handleDeepDive = async (issue: IssueItem) => {
        setIsReportModalOpen(true);
        setReportContent(''); // Reset previous report
        setReportLoading(true);

        try {
            const res = await fetch('/api/trend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ issue }),
            });
            const data = await res.json();

            if (data.success) {
                setReportContent(data.data.report);
            } else {
                setReportContent('### ⚠️ 리포트 생성 실패\n\n' + (data.error || '알 수 없는 오류가 발생했습니다.'));
            }
        } catch (err) {
            console.error('Trend Report Error:', err);
            setReportContent('### ⚠️ 리포트 생성 실패\n\n서버 연결 중 오류가 발생했습니다.');
        } finally {
            setReportLoading(false);
        }
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
                        {/* Action Buttons */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setSelectedBrief(null)}
                            >
                                ← 목록으로 돌아가기
                            </button>

                            <button
                                className="btn"
                                style={{ backgroundColor: '#ef4444', color: 'white' }}
                                onClick={() => {
                                    if (confirm('정말로 이 브리핑을 삭제하시겠습니까?')) {
                                        handleDelete(selectedBrief.date);
                                    }
                                }}
                            >
                                🗑️ 삭제하기
                            </button>
                        </div>

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
                            <IssueCard
                                key={index}
                                issue={issue}
                                index={index}
                                onDeepDive={handleDeepDive}
                            />
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
            <TrendReportModal
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
                report={reportContent}
                loading={reportLoading}
            />
        </div>
    );
}
