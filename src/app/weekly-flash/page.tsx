'use client';

import { useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import Toolbar from '@/components/weekly-flash/Toolbar';
import Skeleton from '@/components/weekly-flash/Skeleton';
import FlashCard from '@/components/weekly-flash/FlashCard';
import SummaryBox from '@/components/weekly-flash/SummaryBox';
import ExportBar from '@/components/weekly-flash/ExportBar';
import { FlashApiResponse, FlashMemo } from '@/lib/weekly-flash/types';
import { FLASH_DISCLAIMER } from '@/lib/weekly-flash/prompt';

export default function WeeklyFlashPage() {
  const [baseDate, setBaseDate] = useState('');
  const [windowDays, setWindowDays] = useState<7 | 14>(7);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memo, setMemo] = useState<FlashMemo | null>(null);
  // 세션 동안만 보관하는 생성 이력
  const [history, setHistory] = useState<FlashMemo[]>([]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/weekly-flash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseDate: baseDate || undefined, windowDays }),
      });
      const json: FlashApiResponse = await res.json();
      if (json.success && json.data) {
        setMemo(json.data);
        setHistory((prev) => [json.data as FlashMemo, ...prev].slice(0, 10));
      } else {
        setError(json.error || '단신 생성에 실패했습니다.');
      }
    } catch {
      setError('서버 연결 오류가 발생했습니다.');
    } finally {
      setGenerating(false);
    }
  };

  const isEmptyResult =
    memo && memo.items.length === 0 && (memo.matchedCount === 0 || memo.matchedCount === null);

  return (
    <div className="container">
      <header className="header no-print">
        <Link href="/" className="logo">
          AI 산업 단신 생성기
        </Link>
        <nav className="nav">
          <Link href="/" className="nav-link">
            데일리 브리핑
          </Link>
          <ThemeToggle />
        </nav>
      </header>

      <main>
        <section className="intro no-print">
          <h1 className="intro-title">최근 1주일 AI 산업 주요 이슈</h1>
          <p className="intro-sub">
            웹 검색 기반으로 경영 관점의 단신 3건과 종합 시사점을 생성합니다. CEO·경영진 보고용 기초 메모.
          </p>
        </section>

        <div className="no-print">
          <Toolbar
            baseDate={baseDate}
            setBaseDate={setBaseDate}
            windowDays={windowDays}
            setWindowDays={setWindowDays}
            onGenerate={generate}
            generating={generating}
          />
        </div>

        {/* 상태별 렌더링 */}
        {generating ? (
          <div className="result-area">
            <Skeleton />
          </div>
        ) : error ? (
          <div className="state-box error no-print">
            <p className="state-title">생성 실패</p>
            <p className="state-desc">{error}</p>
            <button className="btn" onClick={generate}>
              다시 시도
            </button>
          </div>
        ) : memo ? (
          <div className="result-area">
            {/* 메모 메타 + 내보내기 */}
            <div className="result-head no-print">
              <div>
                <span className="result-date">기준일 {memo.baseDate}</span>
                {memo.windowDays > 7 && <span className="result-window">D-14 확장 검색</span>}
                {memo.matchedCount !== null && (
                  <span className="result-count">기준 충족 뉴스 {memo.matchedCount}건</span>
                )}
              </div>
              <ExportBar memo={memo} />
            </div>

            {/* 인쇄/PDF 대상 영역 */}
            <div className="printable">
              <h2 className="memo-title print-only">{memo.title || '최근 1주일 AI 산업 주요 이슈'}</h2>

              {isEmptyResult ? (
                <div className="state-box">
                  <p className="state-title">기준 충족 뉴스 0건</p>
                  <p className="state-desc">
                    선정 기준(2개 이상 해당)을 충족하는 최근 {memo.windowDays}일 뉴스를 찾지 못했습니다.
                    억지로 채우지 않았습니다. D-14 확장 또는 기준일 조정을 검토하세요.
                  </p>
                </div>
              ) : (
                <div className="cards">
                  {memo.items.map((item) => (
                    <FlashCard key={item.index} item={item} />
                  ))}
                </div>
              )}

              {memo.summary && (
                <div className="summary-wrap">
                  <SummaryBox summary={memo.summary} />
                </div>
              )}

              <p className="disclaimer">{FLASH_DISCLAIMER}</p>
            </div>

            {/* grounding 검색 참고 출처 (앱이 보정하지 않은 원본) */}
            {memo.groundingSources.length > 0 && (
              <details className="grounding no-print">
                <summary>검색 참고 출처 {memo.groundingSources.length}건 (검증용 · 원문 확인 권장)</summary>
                <ul>
                  {memo.groundingSources.map((s, i) => (
                    <li key={i}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ) : (
          <div className="state-box no-print idle">
            <p className="state-title">단신을 생성해 보세요</p>
            <p className="state-desc">
              기준일과 검색 범위를 선택하고 “단신 생성”을 누르면, 최근 1주일 AI 산업 이슈 메모가 생성됩니다.
            </p>
          </div>
        )}

        {/* 세션 이력 */}
        {history.length > 1 && (
          <div className="history no-print">
            <span className="history-label">이번 세션 이력</span>
            <div className="history-chips">
              {history.map((h, i) => (
                <button
                  key={i}
                  className={memo === h ? 'chip active' : 'chip'}
                  onClick={() => setMemo(h)}
                >
                  {h.baseDate} · {h.items.length}건
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      <style jsx>{`
        .intro {
          margin: 2rem 0 1.5rem;
        }
        .intro-title {
          font-size: 2rem;
          font-weight: 900;
          letter-spacing: -0.03em;
          color: var(--text-primary);
          word-break: keep-all;
        }
        .intro-sub {
          margin-top: 0.6rem;
          font-size: 1rem;
          color: var(--text-secondary);
          word-break: keep-all;
        }
        .result-area {
          margin-top: 2rem;
        }
        .result-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .result-date {
          font-weight: 800;
          color: var(--text-primary);
        }
        .result-window,
        .result-count {
          margin-left: 0.6rem;
          font-size: 0.8rem;
          font-weight: 700;
          padding: 3px 10px;
          border-radius: 999px;
          background: var(--accent-light);
          color: var(--accent-color);
        }
        .cards {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .summary-wrap {
          margin-top: 1.5rem;
        }
        .disclaimer {
          margin-top: 1.5rem;
          padding: 0.85rem 1rem;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-muted);
          background: var(--bg-secondary);
          border: 1px dashed var(--border-color);
          border-radius: 10px;
        }
        .state-box {
          margin-top: 2rem;
          text-align: center;
          padding: 3rem 2rem;
          background: var(--bg-secondary);
          border: 1px dashed var(--border-color);
          border-radius: 20px;
        }
        .state-box.error {
          border-color: var(--error-color);
        }
        .state-title {
          font-size: 1.1rem;
          font-weight: 800;
          color: var(--text-primary);
          margin-bottom: 0.4rem;
        }
        .state-desc {
          color: var(--text-muted);
          margin-bottom: 1.2rem;
          word-break: keep-all;
        }
        .grounding {
          margin-top: 2rem;
          font-size: 0.88rem;
          color: var(--text-secondary);
        }
        .grounding summary {
          cursor: pointer;
          font-weight: 700;
          color: var(--text-muted);
        }
        .grounding ul {
          margin: 0.75rem 0 0 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .grounding a {
          color: var(--accent-color);
          text-decoration: none;
        }
        .grounding a:hover {
          text-decoration: underline;
        }
        .history {
          margin-top: 2.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--border-color);
        }
        .history-label {
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: var(--text-muted);
        }
        .history-chips {
          margin-top: 0.6rem;
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .chip {
          font-family: inherit;
          font-size: 0.82rem;
          font-weight: 700;
          padding: 0.4rem 0.8rem;
          border-radius: 999px;
          border: 1px solid var(--border-color);
          background: var(--bg-card);
          color: var(--text-secondary);
          cursor: pointer;
        }
        .chip.active {
          border-color: var(--accent-color);
          color: var(--accent-color);
          background: var(--accent-light);
        }
        .print-only {
          display: none;
        }
        /* PDF / 인쇄: 메모 영역만 출력 */
        @media print {
          :global(.no-print) {
            display: none !important;
          }
          .print-only {
            display: block;
          }
          .memo-title {
            font-size: 1.4rem;
            font-weight: 800;
            margin-bottom: 1.5rem;
          }
          .result-area {
            margin-top: 0;
          }
        }
      `}</style>
    </div>
  );
}
