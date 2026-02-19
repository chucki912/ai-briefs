'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import IssueCard from '@/components/IssueCard';
import TrendReportModal from '@/components/TrendReportModal';
import { BriefReport, IssueItem } from '@/types';
import { logger } from '@/lib/logger';

import { useAuth } from '@/contexts/AuthContext';

// 배터리 페이지 전용 - AI 페이지와 완전 분리 (URL로만 접근 가능)
export default function BatteryBriefPage() {
    const { isAdmin } = useAuth();
    const [brief, setBrief] = useState<BriefReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Trend Report State
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [reportContent, setReportContent] = useState('');
    const [reportLoading, setReportLoading] = useState(false);
    const [selectedReportIssue, setSelectedReportIssue] = useState<IssueItem | undefined>(undefined);
    const [isWeeklyMode, setIsWeeklyMode] = useState(false);

    // 배터리 브리핑 로드
    const loadBrief = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/battery/brief');
            const data = await res.json();

            if (data.success) {
                setBrief(data.data);
                setError(null);
            } else {
                setError(data.error || '배터리 브리핑을 불러올 수 없습니다.');
                setBrief(null);
            }
        } catch (err) {
            setError('서버 연결 오류');
            setBrief(null);
        } finally {
            setLoading(false);
        }
    };

    // 배터리 브리핑 생성
    const generateBrief = async (force = false) => {
        try {
            console.log(`[Battery Client] 브리핑 생성 요청 (force: ${force})`);
            setGenerating(true);
            setError(null);

            const res = await fetch('/api/battery/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ force })
            });

            const data = await res.json();
            console.log('[Battery Client] 브리핑 생성 응답:', data);

            if (data.success) {
                setBrief(data.data);
                console.log('[Battery Client] 브리핑 데이터 업데이트 완료');
            } else {
                console.error('[Battery Client] 브리핑 생성 실패:', data.error);
                setError(data.error || '배터리 브리핑 생성에 실패했습니다.');
            }
        } catch (err) {
            console.error('[Battery Client] 브리핑 생성 중 예외 발생:', err);
            setError('배터리 브리핑 생성 중 오류가 발생했습니다.');
        } finally {
            setGenerating(false);
        }
    };

    // 트렌드 리포트 생성 (Deep Dive) - 배터리 전용 API 사용
    const handleDeepDive = async (issue: IssueItem) => {
        setIsReportModalOpen(true);
        setSelectedReportIssue(issue);
        setReportContent('');
        setReportLoading(true);
        setIsWeeklyMode(false);
    };

    // 주간 트렌드 리포트 생성
    const handleWeeklyReport = () => {
        setIsReportModalOpen(true);
        setSelectedReportIssue(undefined);
        setReportContent('');
        setReportLoading(true);
        setIsWeeklyMode(true);
    };

    useEffect(() => {
        loadBrief();
    }, []);

    useEffect(() => {
        if (brief) {
            logger.viewBrief(`battery-${brief.date}`);
        }
    }, [brief]);

    return (
        <div className="container">
            {/* Header - 배터리 전용 (AI 페이지로 가는 링크 없음) */}
            <header className="header">
                <div className="logo" style={{ cursor: 'default' }}>
                    🔋 Battery Daily Brief
                </div>
                <nav className="nav">
                    <Link href="/battery/archive" className="nav-link">
                        아카이브
                    </Link>
                    <ThemeToggle />
                </nav>
            </header>

            {/* Main Content */}
            <main>
                {loading ? (
                    <div className="loading-container">
                        <div className="premium-spinner" />
                        <span className="loading-text">배터리 인텔리전스 데이터를 구성 중입니다...</span>
                    </div>
                ) : brief ? (
                    <>
                        {/* Brief Header - Hero Section */}
                        <div className="hero-section" style={{ background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(59, 130, 246, 0.05))' }}>
                            <div className="hero-content">
                                <div className="date-badge">
                                    <span className="calendar-icon">🔋</span>
                                    {brief.date.replace('battery-', '').split('-')[0]}년 {brief.date.replace('battery-', '').split('-')[1]}월 {brief.date.replace('battery-', '').split('-')[2]}일
                                </div>
                                <h1 className="hero-title">
                                    Battery Daily <span className="highlight" style={{ color: '#22c55e' }}>Intelligence</span>
                                </h1>
                                <p className="hero-subtitle">
                                    K-Battery 관점의 글로벌 배터리 산업 핵심 변화를 감지하고 전략적 통찰을 제공합니다.
                                </p>
                                <div className="hero-meta-container">
                                    <div className="meta-info-group">
                                        <div className="meta-box">
                                            <span className="meta-label">TOTAL SIGNALS</span>
                                            <span className="meta-value">{brief.totalIssues} <span className="unit">Issues</span></span>
                                        </div>
                                        <div className="meta-divider-vertical" />
                                        <div className="meta-box">
                                            <span className="meta-label">GENERATED AT</span>
                                            <span className="meta-value">
                                                {new Date(brief.generatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                                                <span className="unit"> KST</span>
                                            </span>
                                        </div>
                                    </div>

                                    <div className="meta-action-group">
                                        {isAdmin ? (
                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                <button
                                                    className="weekly-report-button"
                                                    onClick={handleWeeklyReport}
                                                    disabled={reportLoading}
                                                    style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.3)' }}
                                                >
                                                    <span>📊</span>
                                                    주간 트렌드 리포트
                                                </button>
                                                <button
                                                    className="regenerate-button"
                                                    onClick={() => generateBrief(true)}
                                                    disabled={generating}
                                                >
                                                    {generating ? (
                                                        <span className="flex-center gap-2">
                                                            <div className="mini-spinner" />
                                                            분석 중...
                                                        </span>
                                                    ) : (
                                                        <span className="flex-center gap-2">
                                                            <span className="sparkle">✨</span>
                                                            새로고침
                                                        </span>
                                                    )}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="sentinel-badge-row" style={{ display: 'flex', gap: '10px' }}>
                                                <div className="sentinel-badge">
                                                    <div className="pulse-dot"></div>
                                                    <span className="sentinel-text">Battery Sentinel Active</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Issues Grid */}
                        <div className="issues-container">
                            {brief.issues.length > 0 ? (
                                brief.issues.map((issue, index) => (
                                    <IssueCard
                                        key={index}
                                        issue={issue}
                                        index={index}
                                        onDeepDive={handleDeepDive}
                                    />
                                ))
                            ) : (
                                <div className="empty-state">
                                    <div className="empty-icon">🔋</div>
                                    <h2 className="empty-title">금일 수집된 배터리 이슈가 없습니다</h2>
                                    <p className="empty-description">
                                        내일 다시 확인해주세요.
                                    </p>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="empty-state">
                        <div className="empty-icon">🔋</div>
                        <h2 className="empty-title">아직 생성된 배터리 브리핑이 없습니다</h2>
                        <p className="empty-description">
                            {error || '지금 바로 오늘의 배터리 뉴스 브리핑을 생성해보세요.'}
                        </p>
                        {isAdmin && (
                            <button
                                className="btn"
                                onClick={() => generateBrief()}
                                disabled={generating}
                                style={{ background: generating ? '#4b5563' : '#22c55e' }}
                            >
                                {generating ? (
                                    <>
                                        <div className="spinner" />
                                        생성 중...
                                    </>
                                ) : (
                                    <>
                                        ⚡ 배터리 브리핑 생성하기
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                )}
            </main>

            {/* Footer - 배터리 전용 */}
            <footer className="footer">
                <p>© 2026 Battery Daily Brief by Sen Cheon. K-Battery 관점의 글로벌 배터리 인텔리전스</p>
            </footer>

            <TrendReportModal
                isOpen={isReportModalOpen}
                onClose={() => { setIsReportModalOpen(false); setIsWeeklyMode(false); }}
                report={reportContent}
                loading={reportLoading}
                issue={selectedReportIssue}
                onRetry={() => selectedReportIssue && handleDeepDive(selectedReportIssue)}
                onGenerationComplete={() => setReportLoading(false)}
                trendReportApiUrl="/api/battery/trend-report"
                weeklyMode={isWeeklyMode}
                weeklyDomain="battery"
            />
            <style jsx>{`
                .hero-meta-container {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 16px;
                    padding: 1.25rem 2rem;
                    margin-top: 2rem;
                    backdrop-filter: blur(10px);
                    box-shadow: var(--shadow-sm);
                }

                .meta-info-group {
                    display: flex;
                    align-items: center;
                    gap: 2rem;
                }

                .meta-box {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .meta-label {
                    font-size: 0.7rem;
                    color: var(--text-muted);
                    font-weight: 700;
                    letter-spacing: 0.05em;
                    text-transform: uppercase;
                }

                .meta-value {
                    font-size: 1.25rem;
                    font-weight: 800;
                    color: var(--text-primary);
                    letter-spacing: -0.02em;
                }

                .unit {
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                    font-weight: 600;
                    margin-left: 2px;
                }

                .meta-divider-vertical {
                    width: 1px;
                    height: 40px;
                    background: var(--border-color);
                }

                .regenerate-button {
                    background: #22c55e;
                    color: #000;
                    border: none;
                    padding: 0.75rem 1.5rem;
                    border-radius: 12px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-size: 0.95rem;
                }

                .regenerate-button:hover {
                    filter: brightness(1.1);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
                }

                .regenerate-button:disabled {
                    background: #4b5563;
                    cursor: not-allowed;
                    transform: none;
                    box-shadow: none;
                }

                .weekly-report-button {
                    background: linear-gradient(135deg, #059669, #10b981);
                    color: white;
                    border: none;
                    padding: 0.75rem 1.5rem;
                    border-radius: 12px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-size: 0.95rem;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                }

                .weekly-report-button:hover:not(:disabled) {
                    filter: brightness(1.1);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
                }

                .weekly-report-button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .sentinel-badge {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px 16px;
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid rgba(34, 197, 94, 0.2);
                    border-radius: 99px;
                }

                .sentinel-text {
                    color: #22c55e;
                    font-size: 0.85rem;
                    font-weight: 700;
                    letter-spacing: 0.05em;
                }

                .pulse-dot {
                    width: 8px;
                    height: 8px;
                    background: #22c55e;
                    border-radius: 50%;
                    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
                    animation: pulse-green 2s infinite;
                }

                @keyframes pulse-green {
                    0% {
                        transform: scale(0.95);
                        box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
                    }
                    70% {
                        transform: scale(1);
                        box-shadow: 0 0 0 10px rgba(34, 197, 94, 0);
                    }
                    100% {
                        transform: scale(0.95);
                        box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
                    }
                }

                .flex-center {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .gap-2 {
                    gap: 0.5rem;
                }

                .mini-spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid rgba(0, 0, 0, 0.3);
                    border-top-color: #000;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                @media (max-width: 640px) {
                    .hero-meta-container {
                        flex-direction: column;
                        gap: 1.5rem;
                        align-items: stretch; /* Stretch items to full width */
                        padding: 1.5rem;
                    }
                    
                    .meta-info-group {
                        flex-direction: column; /* Stack total issues and time */
                        align-items: flex-start;
                        gap: 1rem;
                        width: 100%;
                    }

                    .meta-divider-vertical {
                        display: none; /* Hide vertical divider on mobile */
                    }

                    .meta-box {
                        width: 100%;
                        flex-direction: row;
                        justify-content: space-between;
                        align-items: center;
                        padding-bottom: 0.5rem;
                        border-bottom: 1px dashed var(--border-color);
                    }

                    .meta-box:last-child {
                        border-bottom: none;
                    }

                    .meta-action-group {
                        width: 100%;
                        display: flex;
                        justify-content: center;
                    }

                    .regenerate-button,
                    .weekly-report-button {
                        width: 100%;
                        justify-content: center;
                        padding: 12px;
                    }

                    .sentinel-badge {
                        width: 100%;
                        justify-content: center;
                    }
                }
            `}</style>
        </div>
    );
}
