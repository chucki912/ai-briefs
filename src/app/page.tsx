'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import IssueCard from '@/components/IssueCard';
import TrendReportModal from '@/components/TrendReportModal';
import { BriefReport, IssueItem } from '@/types';

export default function HomePage() {
  const [brief, setBrief] = useState<BriefReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Trend Report State
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportContent, setReportContent] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [selectedReportIssue, setSelectedReportIssue] = useState<IssueItem | undefined>(undefined);

  // 브리핑 로드
  const loadBrief = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/brief');
      const data = await res.json();

      if (data.success) {
        setBrief(data.data);
        setError(null);
      } else {
        setError(data.error || '브리핑을 불러올 수 없습니다.');
        setBrief(null);
      }
    } catch (err) {
      setError('서버 연결 오류');
      setBrief(null);
    } finally {
      setLoading(false);
    }
  };

  // 브리핑 생성
  const generateBrief = async (force = false) => {
    try {
      console.log(`[Client] 브리핑 생성 요청 (force: ${force})`);
      setGenerating(true);
      setError(null);

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force })
      });

      const data = await res.json();
      console.log('[Client] 브리핑 생성 응답:', data);

      if (data.success) {
        setBrief(data.data);
        console.log('[Client] 브리핑 데이터 업데이트 완료');
      } else {
        console.error('[Client] 브리핑 생성 실패:', data.error);
        setError(data.error || '브리핑 생성에 실패했습니다.');
      }
    } catch (err) {
      console.error('[Client] 브리핑 생성 중 예외 발생:', err);
      setError('브리핑 생성 중 오류가 발생했습니다.');
    } finally {
      setGenerating(false);
    }
  };

  // 트렌드 리포트 생성 (Deep Dive)
  const handleDeepDive = async (issue: IssueItem) => {
    setIsReportModalOpen(true);
    setSelectedReportIssue(issue);
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

  useEffect(() => {
    loadBrief();
  }, []);

  return (
    <div className="container">
      {/* Header */}
      <header className="header">
        <Link href="/" className="logo">
          🤖 AI Daily Brief
        </Link>
        <nav className="nav">
          <Link href="/archive" className="nav-link">
            아카이브
          </Link>
          <ThemeToggle />
        </nav>
      </header>

      {/* Main Content */}
      <main>
        {loading ? (
          <div className="loading">
            <div className="spinner" />
            <span>브리핑을 불러오는 중...</span>
          </div>
        ) : brief ? (
          <>
            {/* Brief Header */}
            <div className="brief-header">
              <div className="brief-date">
                {brief.date.split('-')[0]}년 {brief.date.split('-')[1]}월 {brief.date.split('-')[2]}일 ({brief.dayOfWeek})
              </div>
              <div className="brief-title">
                LLM이 찾아주는 데일리 AI 이슈 by Chuck Choi
              </div>
              <div className="brief-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>총 {brief.totalIssues}개 이슈 | 생성: {new Date(brief.generatedAt).toLocaleString('ko-KR')}</span>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                  onClick={() => generateBrief(true)}
                  disabled={generating}
                >
                  {generating ? '재생성 중...' : '✨ 다시 생성'}
                </button>
              </div>
            </div>

            {/* Issues */}
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
                <div className="empty-icon">📭</div>
                <h2 className="empty-title">금일 수집된 주요 이슈가 없습니다</h2>
                <p className="empty-description">
                  내일 다시 확인해주세요.
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">🚀</div>
            <h2 className="empty-title">아직 생성된 브리핑이 없습니다</h2>
            <p className="empty-description">
              {error || '지금 바로 오늘의 AI 뉴스 브리핑을 생성해보세요.'}
            </p>
            <button
              className="btn"
              onClick={() => generateBrief()}
              disabled={generating}
            >
              {generating ? (
                <>
                  <div className="spinner" />
                  생성 중...
                </>
              ) : (
                <>
                  ✨ 브리핑 생성하기
                </>
              )}
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>© 2026 AI Daily Brief. 매일 오전 7시 자동 업데이트</p>
      </footer>

      <TrendReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        report={reportContent}
        loading={reportLoading}
        issue={selectedReportIssue}
        onRetry={() => selectedReportIssue && handleDeepDive(selectedReportIssue)}
      />
    </div>
  );
}
