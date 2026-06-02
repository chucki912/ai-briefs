'use client';

import { useState } from 'react';
import { FlashMemo } from '@/lib/weekly-flash/types';
import { copyMemo, downloadMarkdown, printMemo } from '@/lib/weekly-flash/export';

export default function ExportBar({ memo }: { memo: FlashMemo }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copyMemo(memo);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('클립보드 복사에 실패했습니다.');
    }
  };

  return (
    <div className="export-bar no-print">
      <button className="exp-btn primary" onClick={handleCopy}>
        {copied ? '✓ 복사됨' : '복사'}
      </button>
      <button className="exp-btn" onClick={() => downloadMarkdown(memo)}>
        Markdown
      </button>
      <button className="exp-btn" onClick={printMemo}>
        PDF / 인쇄
      </button>

      <style jsx>{`
        .export-bar {
          display: flex;
          gap: 0.6rem;
          flex-wrap: wrap;
        }
        .exp-btn {
          font-family: inherit;
          font-size: 0.88rem;
          font-weight: 700;
          padding: 0.5rem 1.1rem;
          border-radius: 10px;
          border: 1px solid var(--border-color);
          background: var(--bg-secondary);
          color: var(--text-primary);
          cursor: pointer;
          transition: all 0.15s;
        }
        .exp-btn:hover {
          border-color: var(--accent-color);
          background: var(--accent-light);
        }
        .exp-btn.primary {
          background: var(--accent-color);
          color: #fff;
          border-color: var(--accent-color);
        }
        .exp-btn.primary:hover {
          background: var(--accent-hover);
        }
      `}</style>
    </div>
  );
}
