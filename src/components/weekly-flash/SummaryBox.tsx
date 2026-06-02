'use client';

import { FlashSummary } from '@/lib/weekly-flash/types';

export default function SummaryBox({ summary }: { summary: FlashSummary }) {
  return (
    <section className="summary-box">
      <h3 className="summary-title">종합 시사점</h3>
      <ul className="summary-list">
        {summary.industryDirection && (
          <li>
            <span className="tag">산업 변화 방향</span>
            <span className="text">{summary.industryDirection}</span>
          </li>
        )}
        {summary.koreanResponse && (
          <li>
            <span className="tag">국내 대기업 / LG 대응</span>
            <span className="text">{summary.koreanResponse}</span>
          </li>
        )}
      </ul>

      <style jsx>{`
        .summary-box {
          background: var(--insight-bg);
          border-radius: 18px;
          padding: 1.75rem;
          color: #fff;
          box-shadow: var(--shadow-md);
        }
        .summary-title {
          font-size: 1.05rem;
          font-weight: 800;
          letter-spacing: -0.01em;
          margin-bottom: 1rem;
        }
        .summary-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .summary-list li {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .tag {
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          opacity: 0.85;
          text-transform: uppercase;
        }
        .text {
          font-size: 0.98rem;
          line-height: 1.6;
          word-break: keep-all;
        }
      `}</style>
    </section>
  );
}
