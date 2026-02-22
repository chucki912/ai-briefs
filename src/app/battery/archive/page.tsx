'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import IssueCard from '@/components/IssueCard';
import TrendReportModal from '@/components/TrendReportModal';
import ManualSourceInput from '@/components/ManualSourceInput';
import ArchiveListView from '@/components/ArchiveListView';
import { BriefReport, IssueItem } from '@/types';

import { useAuth } from '@/contexts/AuthContext';

interface BriefSummary {
    id: string;
    date: string;
    dayOfWeek: string;
    totalIssues: number;
    generatedAt: string;
}

export default function BatteryArchivePage() {
    const { isAdmin } = useAuth();
    const [briefs, setBriefs] = useState<BriefSummary[]>([]);
    const [selectedBrief, setSelectedBrief] = useState<BriefReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    // Trend Report State
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [reportContent, setReportContent] = useState('');
    const [reportLoading, setReportLoading] = useState(false);
    const [selectedReportIssue, setSelectedReportIssue] = useState<IssueItem | undefined>(undefined);

    // Admin-only: Selection Mode State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIssues, setSelectedIssues] = useState<IssueItem[]>([]);
    const [manualUrls, setManualUrls] = useState<string[]>(['']);
    const [manualTexts, setManualTexts] = useState<string[]>([]);

    // Weekly Report Generation State
    const [weeklyJobId, setWeeklyJobId] = useState<string | null>(null);
    const [weeklyStatus, setWeeklyStatus] = useState<'collecting' | 'clustering' | 'generating' | 'completed' | 'failed' | null>(null);
    const [weeklyProgress, setWeeklyProgress] = useState(0);
    const [weeklyMessage, setWeeklyMessage] = useState('');
    const [showWeeklySection, setShowWeeklySection] = useState(false);

    // 배터리 브리핑 목록 로드
    const loadBriefs = async () => {
        try {
            setLoading(true);
            const query = viewMode === 'list' ? '?list=true&include_issues=true' : '?list=true';
            const res = await fetch(`/api/battery/brief${query}`);
            const data = await res.json();

            if (data.success) {
                setBriefs(data.data);
            }
        } catch (err) {
            console.error('Failed to load battery briefs:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadBriefs();
    }, [viewMode]);

    // 특정 날짜 배터리 브리핑 로드
    const loadBriefDetail = async (date: string) => {
        try {
            setLoadingDetail(true);
            const res = await fetch(`/api/battery/brief?date=${date}`);
            const data = await res.json();

            if (data.success) {
                setSelectedBrief(data.data);
            }
        } catch (err) {
            console.error('Failed to load battery brief detail:', err);
        } finally {
            setLoadingDetail(false);
        }
    };

    // 브리핑 삭제 (관리자 전용)
    const handleDeleteBrief = async (e: React.MouseEvent, date: string) => {
        e.preventDefault();
        e.stopPropagation();

        if (!confirm('정말로 이 브리핑을 삭제하시겠습니까?')) return;

        try {
            const res = await fetch(`/api/battery/brief?date=${date}`, {
                method: 'DELETE'
            });
            const data = await res.json();

            if (data.success) {
                alert('브리핑이 삭제되었습니다.');
                loadBriefs(); // 목록 갱신
            } else {
                alert(data.error || '삭제 실패');
            }
        } catch (err) {
            console.error('Delete error:', err);
            alert('삭제 중 오류가 발생했습니다.');
        }
    };

    const formatDate = (dateStr: string) => {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[0]}년 ${parseInt(parts[1])}월 ${parseInt(parts[2])}일`;
        }
        return dateStr;
    };

    // 트렌드 리포트 생성 (Deep Dive) - 배터리 전용 API 사용
    const handleDeepDive = async (issue: IssueItem) => {
        setIsReportModalOpen(true);
        setSelectedReportIssue(issue);
        setReportContent('');
        setReportLoading(true);
    };

    // Admin-only: 선택 모드 토글
    const toggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode);
        setSelectedIssues([]);
        setManualUrls(['']);
        setManualTexts([]);
    };

    // Admin-only: 이슈 선택 토글
    const toggleIssueSelection = (issue: IssueItem) => {
        if (selectedIssues.some(i => i.headline === issue.headline)) {
            setSelectedIssues(selectedIssues.filter(i => i.headline !== issue.headline));
        } else {
            setSelectedIssues([...selectedIssues, issue]);
        }
    };

    // Admin-only: 통합 분석 리포트 생성
    // 주간 리포트 생성 시작
    const handleGenerateWeeklyReport = async () => {
        try {
            setWeeklyStatus('collecting');
            setWeeklyProgress(5);
            setWeeklyMessage('데이터 수집 준비 중...');
            setShowWeeklySection(true);

            const res = await fetch('/api/weekly-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain: 'battery' })
            });
            const data = await res.json();

            if (data.success) {
                setWeeklyJobId(data.data.jobId);
            } else {
                throw new Error(data.error || '발급 실패');
            }
        } catch (err: any) {
            console.error('Weekly report start failed:', err);
            setWeeklyStatus('failed');
            setWeeklyMessage(err.message || '리포트 생성 시작 실패');
        }
    };

    // 주간 리포트 상태 폴링
    useEffect(() => {
        if (!weeklyJobId || weeklyStatus === 'completed' || weeklyStatus === 'failed') return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/weekly-report/status?jobId=${weeklyJobId}`);
                const data = await res.json();

                if (data.success) {
                    const { status, progress, message, report, error } = data.data;
                    setWeeklyStatus(status);
                    setWeeklyProgress(progress);
                    setWeeklyMessage(message || '');

                    if (status === 'completed' && report) {
                        setReportContent(report);
                        setIsReportModalOpen(true);
                        setWeeklyJobId(null);
                        clearInterval(interval);
                    } else if (status === 'failed') {
                        setWeeklyMessage(error || '생성 실패');
                        setWeeklyJobId(null);
                        clearInterval(interval);
                    }
                }
            } catch (err) {
                console.error('Status check failed:', err);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [weeklyJobId, weeklyStatus]);

    const handleGenerateAggregatedReport = async () => {
        const validUrls = manualUrls.filter(url => url.trim() !== '');
        const validTexts = manualTexts.filter(t => t.trim() !== '');

        if (selectedIssues.length === 0 && validUrls.length === 0 && validTexts.length === 0) {
            alert('이슈를 선택하거나 수동 소스를 추가해주세요.');
            return;
        }

        setIsReportModalOpen(true);
        setReportLoading(true);
        setReportContent('');
        setSelectedReportIssue(undefined);

        try {
            const res = await fetch('/api/reports/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'CUSTOM',
                    selectionMethod: selectedIssues.length > 0 ? 'MANUAL_SELECTION' : 'MANUAL_ONLY',
                    selectedIssues: selectedIssues,
                    manualUrls: validUrls,
                    manualTexts: validTexts,
                })
            });

            if (!res.ok) throw new Error('Report generation failed');

            const data = await res.json();
            setReportContent(data.report);
        } catch (e) {
            console.error(e);
            alert('리포트 생성 실패');
            setIsReportModalOpen(false);
        } finally {
            setReportLoading(false);
        }
    };

    return (
        <div className="container">
            {/* Header - Battery Theme */}
            <header className="header">
                <Link href="/battery" className="logo" style={{ color: '#22c55e' }}>
                    🔋 Battery Daily Brief
                </Link>
                <nav className="nav">
                    <Link href="/battery" className="nav-link">
                        오늘의 브리핑
                    </Link>
                    <ThemeToggle />
                </nav>
            </header>

            {/* Main Content */}
            <main>
                <div className="archive-header animate-in">
                    <h1 className="archive-title">
                        Battery <span className="highlight" style={{ color: '#22c55e' }}>Archive</span>
                    </h1>
                    <p className="archive-subtitle">
                        글로벌 배터리 산업의 과거 리포트를 확인하고 K-Battery의 흐름을 추적하세요.
                    </p>

                    {!selectedBrief && (
                        <div className="view-switcher-container animate-in">
                            <div className="view-switcher">
                                <button
                                    className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                                    onClick={() => setViewMode('grid')}
                                >
                                    📅 날짜별 보기
                                </button>
                                <button
                                    className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                                    onClick={() => setViewMode('list')}
                                >
                                    📋 리스트 보기
                                </button>
                            </div>

                            <div className="weekly-trigger-container">
                                {!showWeeklySection ? (
                                    <button className="weekly-start-btn" onClick={() => setShowWeeklySection(true)}>
                                        ✨ 주간 배터리 트렌드 분석
                                    </button>
                                ) : (
                                    <div className="weekly-control-panel card-glow animate-in">
                                        <div className="panel-header">
                                            <div className="panel-info">
                                                <h3 className="panel-title">주간 K-Battery 인텔리전스 분석</h3>
                                                <p className="panel-desc">최근 7일간의 모든 이슈를 클러스터링하고 글로벌 시장 동향을 융합 분석합니다.</p>
                                            </div>
                                            <button className="panel-close" onClick={() => setShowWeeklySection(false)}>×</button>
                                        </div>

                                        {!weeklyStatus || weeklyStatus === 'failed' ? (
                                            <div className="panel-action">
                                                <button className="weekly-action-btn" onClick={handleGenerateWeeklyReport}>
                                                    분석 시작 (약 2-3분 소요)
                                                </button>
                                                {weeklyStatus === 'failed' && <p className="status-error">{weeklyMessage}</p>}
                                            </div>
                                        ) : (
                                            <div className="progress-container">
                                                <div className="progress-info">
                                                    <span className="status-badge pulse">{weeklyStatus}...</span>
                                                    <span className="progress-percent">{weeklyProgress}%</span>
                                                </div>
                                                <div className="progress-track">
                                                    <div className="progress-fill" style={{ width: `${weeklyProgress}%` }} />
                                                </div>
                                                <p className="progress-msg">{weeklyMessage}</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {loading ? (
                    <div className="loading-container">
                        <div className="premium-spinner" style={{ borderTopColor: '#22c55e' }} />
                        <span className="loading-text">배터리 아카이브를 불러오는 중...</span>
                    </div>
                ) : (
                    <>
                        {/* Action Toolbar - Persistent in Detail or List View Selection Mode */}
                        {(selectedBrief || (viewMode === 'list' && briefs.length > 0)) && (
                            <div className="selection-toolbar animate-in">
                                <button
                                    className={`selection-toggle-btn ${isSelectionMode ? 'active' : ''}`}
                                    onClick={toggleSelectionMode}
                                >
                                    {isSelectionMode ? '✅ 선택 모드 종료' : '☑️ 다중 선택 모드'}
                                </button>

                                {isSelectionMode && selectedIssues.length > 0 && (
                                    <button
                                        className="generate-report-btn"
                                        onClick={handleGenerateAggregatedReport}
                                    >
                                        ✨ 소집({selectedIssues.length}) 통합 분석 리포트 생성
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Manual Source Input Section */}
                        {isSelectionMode && (selectedBrief || viewMode === 'list') && (
                            <ManualSourceInput
                                manualUrls={manualUrls}
                                setManualUrls={setManualUrls}
                                manualTexts={manualTexts}
                                setManualTexts={setManualTexts}
                            />
                        )}

                        {selectedBrief ? (
                            <>
                                {/* Action Buttons */}
                                <div className="action-row animate-in">
                                    <button
                                        className="back-button"
                                        onClick={() => { setSelectedBrief(null); setIsSelectionMode(false); }}
                                    >
                                        <span className="icon">←</span> 전체 목록
                                    </button>
                                    {isAdmin && (
                                        <button
                                            className="delete-brief-btn"
                                            onClick={(e) => handleDeleteBrief(e, selectedBrief.date)}
                                        >
                                            🗑️ 삭제
                                        </button>
                                    )}
                                </div>

                                {/* Brief Detail - Battery Styled */}
                                <div className="hero-section animate-in" style={{ background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(59, 130, 246, 0.05))' }}>
                                    <div className="hero-content">
                                        <div className="date-badge">
                                            <span className="calendar-icon">🔋</span>
                                            {selectedBrief.date.replace('battery-', '').split('-')[0]}년 {selectedBrief.date.replace('battery-', '').split('-')[1]}월 {selectedBrief.date.replace('battery-', '').split('-')[2]}일
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
                                                <span className="meta-value">{selectedBrief.totalIssues} Issues</span>
                                            </div>
                                            <div className="meta-divider" />
                                            <div className="meta-item">
                                                <span className="meta-label">Generated At</span>
                                                <span className="meta-value">
                                                    {new Date(selectedBrief.generatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) + ' KST'}
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
                                            onDeepDive={isAdmin ? handleDeepDive : undefined}
                                            isSelectionMode={isAdmin && isSelectionMode}
                                            isSelected={selectedIssues.some(i => i.headline === issue.headline)}
                                            onSelect={() => toggleIssueSelection(issue)}
                                            briefDate={selectedBrief.date}
                                        />
                                    ))}
                                </div>
                            </>
                        ) : briefs.length > 0 ? (
                            viewMode === 'grid' ? (
                                <div className="archive-grid animate-in">
                                    {briefs.map((brief) => (
                                        <div key={brief.id} style={{ position: 'relative' }}>
                                            <a
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
                                                    <span className="count" style={{ color: '#22c55e' }}>{brief.totalIssues} Signals</span>
                                                    <span className="arrow">→</span>
                                                </div>
                                            </a>
                                            {isAdmin && (
                                                <button
                                                    className="delete-button"
                                                    onClick={(e) => handleDeleteBrief(e, brief.date)}
                                                    title="삭제"
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <ArchiveListView
                                    briefs={briefs}
                                    selectedIssues={selectedIssues}
                                    onToggleSelection={toggleIssueSelection}
                                    accentColor="#22c55e"
                                    isSelectionMode={isSelectionMode}
                                    onIssueClick={(issue) => loadBriefDetail(issue.date)}
                                />
                            )
                        ) : (
                            <div className="empty-state">
                                <div className="empty-icon">🔋</div>
                                <h2 className="empty-title">아직 저장된 배터리 브리핑이 없습니다</h2>
                                <p className="empty-description">
                                    브리핑이 생성되면 여기에 자동으로 보관됩니다.
                                </p>
                                <Link href="/battery" className="btn" style={{ background: '#22c55e' }}>
                                    오늘의 배터리 브리핑 보기
                                </Link>
                            </div>
                        )}

                        {loadingDetail && (
                            <div className="modal-overlay">
                                <div className="loading-container">
                                    <div className="premium-spinner" style={{ borderTopColor: '#22c55e' }} />
                                    <span className="loading-text">리포트를 구성 중입니다...</span>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>

            <footer className="footer">
                <p>© 2026 Battery Daily Brief. K-Battery Intelligence Archive</p>
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

            <style jsx>{`
                .archive-header { margin-bottom: 4rem; text-align: center; }
                .archive-title { font-size: 3rem; font-weight: 900; margin-bottom: 1rem; letter-spacing: -0.04em; }
                .archive-subtitle { color: var(--text-secondary); font-size: 1.1rem; }
                .view-switcher {
                    display: flex;
                    justify-content: center;
                    gap: 1rem;
                    margin-top: 1rem;
                }
                .view-btn {
                    background: var(--bg-secondary);
                    border: 1.5px solid var(--border-color);
                    border-radius: 12px;
                    padding: 8px 16px;
                    font-size: 0.9rem;
                    font-weight: 700;
                    color: var(--text-secondary);
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .view-btn:hover {
                    border-color: #22c55e;
                    color: #22c55e;
                }
                .view-btn.active {
                    background: #22c55e;
                    color: white;
                    border-color: #22c55e;
                }
                .archive-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1.5rem; }
                
                .premium-archive-card {
                    background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 20px;
                    padding: 1.5rem; text-decoration: none; transition: all 0.3s ease;
                    display: flex; flex-direction: column; gap: 4px;
                    height: 100%;
                }
                .premium-archive-card:hover { transform: translateY(-5px); border-color: #22c55e; box-shadow: var(--shadow-md); }
                .archive-card-date { font-size: 1.1rem; font-weight: 800; color: var(--text-primary); }
                .archive-card-day { font-size: 0.9rem; color: var(--text-muted); font-weight: 600; margin-bottom: 1rem; }
                .archive-card-footer { display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 1rem; border-top: 1px solid var(--border-color); }
                .archive-card-footer .count { font-size: 0.8rem; font-weight: 700; }
                .archive-card-footer .arrow { transition: transform 0.2s; }
                .premium-archive-card:hover .arrow { transform: translateX(4px); }
                
                .delete-button {
                    position: absolute; top: -10px; right: -10px; width: 24px; height: 24px;
                    border-radius: 50%; background: #ef4444; color: white; border: none;
                    font-size: 16px; font-weight: bold; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    opacity: 0; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }
                div[style*="position: relative"]:hover .delete-button { opacity: 1; }
                .delete-button:hover { background: #dc2626; transform: scale(1.1); }

                .action-row {
                    display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;
                }

                .back-button { 
                    background: rgba(34, 197, 94, 0.1); color: #22c55e;
                    border: 1px solid rgba(34, 197, 94, 0.2); border-radius: 99px;
                    padding: 10px 24px; font-size: 0.95rem; font-weight: 700; cursor: pointer;
                    display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s ease;
                }
                .back-button:hover { 
                    background: #22c55e; color: #fff; border-color: #22c55e;
                    transform: translateX(-4px); box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
                }

                .delete-brief-btn {
                    background: rgba(239, 68, 68, 0.08); color: var(--error-color, #ef4444);
                    border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 99px;
                    padding: 10px 24px; font-size: 0.95rem; font-weight: 700; cursor: pointer;
                    display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s;
                }
                .delete-brief-btn:hover {
                    background: var(--error-color, #ef4444); color: white;
                    border-color: var(--error-color, #ef4444);
                }

                /* Admin: Selection Toolbar */
                .selection-toolbar {
                    display: flex; gap: 0.75rem; margin-bottom: 1.5rem;
                    flex-wrap: wrap; align-items: center;
                }
                .selection-toggle-btn {
                    background: var(--bg-card); border: 1.5px solid var(--border-color);
                    padding: 10px 20px; border-radius: 14px; cursor: pointer;
                    font-size: 0.88rem; font-weight: 700; color: var(--text-secondary);
                    display: inline-flex; align-items: center; gap: 6px;
                    transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    letter-spacing: -0.01em;
                }
                .selection-toggle-btn:hover {
                    border-color: #22c55e; color: #22c55e;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 14px rgba(34, 197, 94, 0.12);
                }
                .selection-toggle-btn.active {
                    background: linear-gradient(135deg, #22c55e, #16a34a);
                    color: white; border-color: transparent;
                    box-shadow: 0 4px 16px rgba(34, 197, 94, 0.35);
                }
                .selection-toggle-btn.active:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(34, 197, 94, 0.45);
                }

                .generate-report-btn {
                    background: linear-gradient(135deg, #22c55e, #059669);
                    color: white; border: none; padding: 10px 22px; border-radius: 14px;
                    font-size: 0.88rem; font-weight: 700; cursor: pointer;
                    display: inline-flex; align-items: center; gap: 6px;
                    box-shadow: 0 4px 14px rgba(34, 197, 94, 0.3);
                    transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    letter-spacing: -0.01em;
                }
                .generate-report-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(34, 197, 94, 0.45);
                }

                .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px); display: flex; justify-content: center; align-items: center; z-index: 1000; }
                .animate-in { animation: fadeInUp 0.6s ease-out forwards; }
                @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

                @media (max-width: 480px) {
                    .archive-header { margin-bottom: 2.5rem; }
                    .archive-title { font-size: 2.2rem; letter-spacing: -0.04em; }
                    .archive-subtitle { font-size: 0.95rem; }
                    .view-switcher-container { flex-direction: column; gap: 1rem; }
                    .weekly-start-btn { width: 100%; justify-content: center; }
                }

                /* Weekly Panel Styles - Battery Theme (Green) */
                .view-switcher-container {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 2rem;
                    gap: 20px;
                }
                .weekly-trigger-container {
                    flex: 1;
                    max-width: 600px;
                    display: flex;
                    justify-content: flex-end;
                }
                .weekly-start-btn {
                    background: linear-gradient(135deg, #22c55e, #3b82f6);
                    color: white;
                    border: none;
                    padding: 10px 24px;
                    border-radius: 14px;
                    font-size: 0.9rem;
                    font-weight: 700;
                    cursor: pointer;
                    box-shadow: 0 4px 14px rgba(34, 197, 94, 0.2);
                    transition: all 0.2s;
                }
                .weekly-start-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(34, 197, 94, 0.3);
                }
                .weekly-control-panel {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 20px;
                    padding: 20px;
                    width: 100%;
                    position: relative;
                }
                .card-glow {
                    box-shadow: 0 0 20px rgba(34, 197, 94, 0.1);
                }
                .panel-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 20px;
                }
                .panel-title {
                    font-size: 1rem;
                    font-weight: 800;
                    margin-bottom: 4px;
                    color: var(--text-primary);
                }
                .panel-desc {
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                }
                .panel-close {
                    background: none;
                    border: none;
                    font-size: 1.5rem;
                    color: var(--text-muted);
                    cursor: pointer;
                    line-height: 1;
                }
                .weekly-action-btn {
                    background: #22c55e;
                    color: white;
                    border: none;
                    width: 100%;
                    padding: 12px;
                    border-radius: 12px;
                    font-weight: 700;
                    cursor: pointer;
                }
                .progress-container {
                    padding-top: 10px;
                }
                .progress-info {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }
                .status-badge {
                    font-size: 0.75rem;
                    font-weight: 900;
                    text-transform: uppercase;
                    color: #22c55e;
                }
                .progress-percent {
                    font-size: 0.8rem;
                    font-weight: 800;
                }
                .progress-track {
                    height: 8px;
                    background: var(--bg-secondary);
                    border-radius: 4px;
                    overflow: hidden;
                    margin-bottom: 8px;
                }
                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #22c55e, #3b82f6);
                    transition: width 0.4s ease;
                }
                .progress-msg {
                    font-size: 0.8rem;
                    color: var(--text-secondary);
                    text-align: center;
                }
                .status-error {
                    color: var(--error-color);
                    font-size: 0.8rem;
                    margin-top: 8px;
                    text-align: center;
                }
                .pulse {
                    animation: pulse 2s infinite;
                }
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }
            `}</style>
        </div>
    );
}
