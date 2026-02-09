'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import IssueCard from '@/components/IssueCard';
import TrendReportModal from '@/components/TrendReportModal';
import { BriefReport, IssueItem } from '@/types';
import { logger } from '@/lib/logger';

// 배터리 페이지 전용 - AI 페이지와 완전 분리 (URL로만 접근 가능)
export default function BatteryBriefPage() {
    const [brief, setBrief] = useState<BriefReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Trend Report State
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [reportContent, setReportContent] = useState('');
    const [reportLoading, setReportLoading] = useState(false);
    const [selectedReportIssue, setSelectedReportIssue] = useState<IssueItem | undefined>(undefined);

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
                                <div className="hero-meta">
                                    <div className="meta-item">
                                        <span className="meta-label">Total Signals</span>
                                        <span className="meta-value">{brief.totalIssues} Issues</span>
                                    </div>
                                    <div className="meta-divider" />
                                    <div className="meta-item">
                                        <span className="meta-label">Generated At</span>
                                        <span className="meta-value">{new Date(brief.generatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} KST</span>
                                    </div>
                                    <div className="meta-filler" />
                                    <button
                                        className="regenerate-button"
                                        onClick={() => generateBrief(true)}
                                        disabled={generating}
                                        style={{ background: generating ? '#4b5563' : '#22c55e' }}
                                    >
                                        {generating ? (
                                            <>
                                                <div className="mini-spinner" />
                                                분석 중...
                                            </>
                                        ) : (
                                            <>
                                                <span className="sparkle">⚡</span>
                                                새로고침
                                            </>
                                        )}
                                    </button>
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
                    </div>
                )}
            </main>

            {/* Footer - 배터리 전용 */}
            <footer className="footer">
                <p>© 2026 Battery Daily Brief by Sen Cheon. K-Battery 관점의 글로벌 배터리 인텔리전스</p>
            </footer>

            <TrendReportModal
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
                report={reportContent}
                loading={reportLoading}
                issue={selectedReportIssue}
                onRetry={() => selectedReportIssue && handleDeepDive(selectedReportIssue)}
                onGenerationComplete={() => setReportLoading(false)}
                trendReportApiUrl="/api/battery/trend-report"
            />
        </div>
    );
}
