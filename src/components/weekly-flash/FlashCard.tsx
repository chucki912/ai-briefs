'use client';

import { FlashItem } from '@/lib/weekly-flash/types';

interface FlashCardProps {
  item: FlashItem;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** 라벨 + 본문 한 줄 */
function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <p className="field-body">{value}</p>
      <style jsx>{`
        .field {
          margin-top: 0.9rem;
        }
        .field-label {
          display: inline-block;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: var(--text-muted);
          margin-bottom: 0.25rem;
        }
        .field-body {
          font-size: 0.95rem;
          line-height: 1.65;
          color: var(--text-secondary);
          white-space: pre-wrap;
          word-break: keep-all;
        }
      `}</style>
    </div>
  );
}

export default function FlashCard({ item }: FlashCardProps) {
  const { source } = item;
  const hasLink = Boolean(source.link);

  return (
    <article className="flash-card">
      <header className="card-head">
        <span className="card-index">{item.index}</span>
        <h3 className="card-title">{item.title || '(제목 미상)'}</h3>
        <div className="badges">
          {item.isExtended && <span className="badge badge-extended">기준 외 확장</span>}
          {item.hasUnverified && <span className="badge badge-unverified">미확인 포함</span>}
        </div>
      </header>

      {/* 발표일 / 출처 */}
      <div className="source-row">
        <span className="field-label">발표일 / 출처</span>
        <div className="source-body">
          {source.publishedDate && <span className="src-date">{source.publishedDate}</span>}
          {source.outlet && <span className="src-outlet">{source.outlet}</span>}
          {source.articleTitle && <span className="src-article">“{source.articleTitle}”</span>}
          {hasLink ? (
            <a className="src-link" href={source.link} target="_blank" rel="noopener noreferrer">
              {hostname(source.link)} ↗
            </a>
          ) : (
            <span className="badge badge-unverified">링크 미확인</span>
          )}
        </div>
        {!source.publishedDate && !source.outlet && !source.articleTitle && !hasLink && source.raw && (
          <p className="source-raw">{source.raw}</p>
        )}
      </div>

      <Field label="주요 내용" value={item.mainContent} />
      <Field label="트렌드 해석" value={item.trendInterpretation} />
      <Field label="경영 시사점" value={item.managementImplication} />

      {item.ceoQuestion && (
        <div className="ceo-box">
          <span className="ceo-label">CEO 질문 가능성</span>
          <p className="ceo-body">{item.ceoQuestion}</p>
        </div>
      )}

      <style jsx>{`
        .flash-card {
          background: var(--bg-card);
          backdrop-filter: blur(8px);
          border: 1px solid var(--border-color);
          border-radius: 18px;
          padding: 1.75rem;
          box-shadow: var(--shadow-sm);
          transition: box-shadow 0.2s, border-color 0.2s;
        }
        .flash-card:hover {
          box-shadow: var(--shadow-md);
          border-color: var(--accent-color);
        }
        .card-head {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .card-index {
          flex: 0 0 auto;
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: var(--accent-light);
          color: var(--accent-color);
          font-weight: 800;
          font-size: 0.9rem;
        }
        .card-title {
          flex: 1;
          font-size: 1.18rem;
          font-weight: 800;
          line-height: 1.4;
          letter-spacing: -0.02em;
          color: var(--text-primary);
          word-break: keep-all;
        }
        .badges {
          display: flex;
          gap: 0.4rem;
          flex-wrap: wrap;
        }
        .badge {
          font-size: 0.7rem;
          font-weight: 800;
          padding: 3px 9px;
          border-radius: 999px;
          white-space: nowrap;
        }
        .badge-extended {
          background: rgba(245, 158, 11, 0.12);
          color: var(--warning-color);
          border: 1px solid rgba(245, 158, 11, 0.3);
        }
        .badge-unverified {
          background: rgba(239, 68, 68, 0.1);
          color: var(--error-color);
          border: 1px solid rgba(239, 68, 68, 0.28);
        }
        .field-label {
          display: inline-block;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: var(--text-muted);
          margin-bottom: 0.25rem;
        }
        .source-row {
          margin-top: 1.1rem;
          padding: 0.85rem 1rem;
          background: var(--bg-secondary);
          border-radius: 12px;
        }
        .source-body {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.88rem;
          color: var(--text-secondary);
        }
        .src-date {
          font-weight: 700;
          color: var(--text-primary);
        }
        .src-outlet {
          font-weight: 600;
        }
        .src-article {
          color: var(--text-muted);
        }
        .src-link {
          color: var(--accent-color);
          font-weight: 700;
          text-decoration: none;
        }
        .src-link:hover {
          text-decoration: underline;
        }
        .source-raw {
          margin-top: 0.35rem;
          font-size: 0.85rem;
          color: var(--text-muted);
          white-space: pre-wrap;
        }
        .ceo-box {
          margin-top: 1.1rem;
          padding: 0.9rem 1rem;
          border-left: 3px solid var(--accent-color);
          background: var(--accent-light);
          border-radius: 0 10px 10px 0;
        }
        .ceo-label {
          display: inline-block;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: var(--accent-color);
          margin-bottom: 0.2rem;
        }
        .ceo-body {
          font-size: 0.95rem;
          line-height: 1.6;
          color: var(--text-primary);
          word-break: keep-all;
        }
      `}</style>
    </article>
  );
}
