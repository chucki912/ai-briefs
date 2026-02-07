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
    const [selectedReportIssue, setSelectedReportIssue] = useState<IssueItem | undefined>(undefined);

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
        setSelectedReportIssue(issue);
        setReportContent(''); // Reset previous report
        setReportLoading(true); // Signal to Modal to start generation
    };

    return (
        <div className="container">
            {/* Header */}
            <header className="header">
                <Link href="/" className="logo">
                    🤖 AI Intelligence
                </Link>
                <nav className="nav">
                    <Link href="/" className="nav-link">
                        Intelligence
                    </Link>
                    <ThemeToggle />
                </nav>
            </header>

            {/* Main Content */}
            <main>
                <div className="archive-header animate-in">
                    <h1 className="archive-title">
                        Knowledge <span className="highlight">Archive</span>
                    </h1>
                    <p className="archive-subtitle">
                        지난 인텔리전스 리포트를 확인하고 산업의 흐름을 추적하세요.
                    </p>
                </div>

                {loading ? (
                    <div className="loading-container">
                        <div className="premium-spinner" />
                        <span className="loading-text">아카이브를 불러오는 중...</span>
                    </div>
                ) : selectedBrief ? (
                    <>
                        {/* Action Buttons */}
                        <div className="action-row animate-in">
                            <button
                                className="back-button"
                                onClick={() => setSelectedBrief(null)}
                            >
                                <span className="icon">←</span> 전체 목록
                            </button>

                            {selectedBrief.date === new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) && (
                                <button
                                    className="delete-button"
                                    onClick={() => {
                                        if (confirm('정말로 이 브리핑을 삭제하시겠습니까?')) {
                                            handleDelete(selectedBrief.date);
                                        }
                                    }}
                                >
                                    🗑️ 삭제
                                </button>
                            )}
                        </div>

                        {/* Brief Detail - Styled to match Home Page */}
                        <div className="hero-section animate-in">
                            <div className="hero-content">
                                <div className="date-badge">
                                    <span className="calendar-icon">📅</span>
                                    {selectedBrief.date.split('-')[0]}년 {selectedBrief.date.split('-')[1]}월 {selectedBrief.date.split('-')[2]}일
                                </div>
                                <h1 className="hero-title">
                                    AI Daily <span className="highlight">Intelligence</span>
                                </h1>
                                <p className="hero-subtitle">
                                    글로벌 AI 산업의 핵심 변화를 감지하고 전략적 통찰을 제공합니다.
                                </p>
                                <div className="hero-meta">
                                    <div className="meta-item">
                                        <span className="meta-label">Total Signals</span>
                                        <span className="meta-value">{selectedBrief.totalIssues} Issues</span>
                                    </div>
                                    <div className="meta-divider" />
                                    <div className="meta-item">
                                        <span className="meta-label">Generated At</span>
                                        <span className="meta-value">
                                            {selectedBrief.generatedAt
                                                ? new Date(selectedBrief.generatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) + ' KST'
                                                : 'Archived'}
                                        </span>
                                    </div>
                                    <div className="meta-filler" />
                                </div>
                            </div>
                        </div>

                        <div className="issues-container">
                            {selectedBrief.issues.map((issue, index) => (
                                <IssueCard
                                    key={index}
                                    issue={issue}
                                    index={index}
                                    onDeepDive={handleDeepDive}
                                />
                            ))}
                        </div>
                    </>
                ) : briefs.length > 0 ? (
                    <div className="archive-grid animate-in">
                        {briefs.map((brief) => (
                            <a
                                key={brief.id}
                                href="#"
                                className="premium-archive-card"
                                onClick={(e) => {
                                    e.preventDefault();
                                    loadBriefDetail(brief.date);
                                }}
                            >
                                <div className="archive-card-date">{formatDate(brief.date)}</div>
                                <div className="archive-card-day">{brief.dayOfWeek}</div>
                                <div className="archive-card-footer">
                                    <span className="count">{brief.totalIssues} Signals</span>
                                    <span className="arrow">→</span>
                                </div>
                            </a>
                        ))}
                    </div>
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
                    <div className="modal-overlay">
                        <div className="loading-container">
                            <div className="premium-spinner" />
                            <span className="loading-text">리포트를 구성 중입니다...</span>
                        </div>
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
                issue={selectedReportIssue}
                onRetry={() => selectedReportIssue && handleDeepDive(selectedReportIssue)}
                onGenerationComplete={() => setReportLoading(false)}
            />

            <style jsx>{`
                .archive-header {
                    margin-bottom: 4rem;
                    text-align: center;
                }
                .archive-title {
                    font-size: 3rem;
                    font-weight: 900;
                    margin-bottom: 1rem;
                    letter-spacing: -0.04em;
                }
                .archive-title .highlight {
                    color: var(--accent-color);
                }
                .archive-subtitle {
                    color: var(--text-secondary);
                    font-size: 1.1rem;
                }
                .archive-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
                    gap: 1.5rem;
                }
                .premium-archive-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 20px;
                    padding: 1.5rem;
                    text-decoration: none;
                    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .premium-archive-card:hover {
                    transform: translateY(-5px);
                    border-color: var(--accent-color);
                    box-shadow: var(--shadow-md);
                }
                .archive-card-date {
                    font-size: 1.1rem;
                    font-weight: 800;
                    color: var(--text-primary);
                }
                .archive-card-day {
                    font-size: 0.9rem;
                    color: var(--text-muted);
                    font-weight: 600;
                    margin-bottom: 1rem;
                }
                .archive-card-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: auto;
                    padding-top: 1rem;
                    border-top: 1px solid var(--border-color);
                }
                .archive-card-footer .count {
                    font-size: 0.8rem;
                    font-weight: 700;
                    color: var(--accent-color);
                }
                .archive-card-footer .arrow {
                    transition: transform 0.2s;
                }
                .premium-archive-card:hover .arrow {
                    transform: translateX(4px);
                }
                .action-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 2rem;
                }
                .back-button, .delete-button {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 8px 16px;
                    font-size: 0.9rem;
                    font-weight: 700;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s;
                }
                .back-button:hover {
                    background: var(--bg-card);
                    border-color: var(--accent-color);
                }
                .delete-button {
                    color: var(--error-color);
                }
                .delete-button:hover {
                    background: var(--error-color);
                    color: white;
                    border-color: var(--error-color);
                }
                .detail-hero {
                    background: var(--bg-secondary);
                    padding: 3rem 0;
                    border-radius: 32px;
                    border: 1px solid var(--border-color);
                    margin-bottom: 3rem;
                }
                .detail-title {
                    font-size: 2rem;
                    font-weight: 900;
                    margin-bottom: 2rem;
                    letter-spacing: -0.02em;
                }
                .modal-overlay {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px);
                    display: flex; justify-content: center; align-items: center;
                    z-index: 1000;
                }
                .animate-in {
                    animation: fadeInUp 0.6s ease-out forwards;
                }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                @media (max-width: 480px) {
                    .archive-header {
                        margin-bottom: 2rem;
                    }

                    .archive-title {
                        font-size: 2rem;
                    }

                    .archive-subtitle {
                        font-size: 0.95rem;
                    }

                    .action-row {
                        flex-direction: column;
                        gap: 1rem;
                    }

                    .back-button, .delete-button {
                        width: 100%;
                        justify-content: center;
                        padding: 12px;
                    }

                    .archive-grid {
                        grid-template-columns: 1fr;
                        gap: 1rem;
                    }

                    .premium-archive-card {
                        padding: 1.25rem;
                    }

                    .detail-hero {
                        padding: 2rem 1.5rem;
                        border-radius: 20px;
                    }

                    .detail-title {
                        font-size: 1.5rem;
                    }
                }
            `}</style>
        </div>
    );
}

