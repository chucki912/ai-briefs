'use client';

interface ToolbarProps {
  baseDate: string;
  setBaseDate: (v: string) => void;
  windowDays: 7 | 14;
  setWindowDays: (v: 7 | 14) => void;
  onGenerate: () => void;
  generating: boolean;
}

export default function Toolbar({
  baseDate,
  setBaseDate,
  windowDays,
  setWindowDays,
  onGenerate,
  generating,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="control">
        <label htmlFor="base-date" className="control-label">
          기준일 <span className="hint">(비우면 오늘)</span>
        </label>
        <input
          id="base-date"
          type="date"
          className="date-input"
          value={baseDate}
          max={new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })}
          onChange={(e) => setBaseDate(e.target.value)}
          disabled={generating}
        />
      </div>

      <div className="control">
        <span className="control-label">검색 확장</span>
        <div className="toggle" role="group" aria-label="검색 확장 범위">
          <button
            type="button"
            className={windowDays === 7 ? 'toggle-btn active' : 'toggle-btn'}
            onClick={() => setWindowDays(7)}
            disabled={generating}
          >
            D-7
          </button>
          <button
            type="button"
            className={windowDays === 14 ? 'toggle-btn active' : 'toggle-btn'}
            onClick={() => setWindowDays(14)}
            disabled={generating}
          >
            D-14
          </button>
        </div>
      </div>

      <div className="control grow">
        <button className="generate-btn" onClick={onGenerate} disabled={generating}>
          {generating ? (
            <>
              <span className="mini-spinner" />
              생성 중...
            </>
          ) : (
            <>✦ 단신 생성</>
          )}
        </button>
      </div>

      <style jsx>{`
        .toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          gap: 1.25rem;
          background: var(--bg-card);
          backdrop-filter: blur(8px);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          padding: 1.25rem 1.5rem;
          box-shadow: var(--shadow-sm);
        }
        .control {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .control.grow {
          flex: 1;
          align-items: flex-end;
          min-width: 160px;
        }
        .control-label {
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: var(--text-muted);
        }
        .hint {
          font-weight: 600;
          color: var(--text-muted);
          opacity: 0.8;
        }
        .date-input {
          font-family: inherit;
          font-size: 0.92rem;
          padding: 0.55rem 0.75rem;
          border: 1px solid var(--border-color);
          border-radius: 10px;
          background: var(--bg-primary);
          color: var(--text-primary);
        }
        .date-input:focus {
          outline: none;
          border-color: var(--accent-color);
        }
        .toggle {
          display: inline-flex;
          border: 1px solid var(--border-color);
          border-radius: 10px;
          overflow: hidden;
        }
        .toggle-btn {
          font-family: inherit;
          font-size: 0.88rem;
          font-weight: 700;
          padding: 0.55rem 1rem;
          background: var(--bg-primary);
          color: var(--text-secondary);
          border: none;
          cursor: pointer;
          transition: all 0.15s;
        }
        .toggle-btn + .toggle-btn {
          border-left: 1px solid var(--border-color);
        }
        .toggle-btn.active {
          background: var(--accent-color);
          color: #fff;
        }
        .toggle-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .generate-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-family: inherit;
          font-size: 0.95rem;
          font-weight: 700;
          padding: 0.7rem 1.6rem;
          border: none;
          border-radius: 12px;
          background: var(--accent-color);
          color: #fff;
          cursor: pointer;
          transition: all 0.2s;
        }
        .generate-btn:hover:not(:disabled) {
          background: var(--accent-hover);
          transform: translateY(-1px);
        }
        .generate-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .mini-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        @media (max-width: 640px) {
          .control.grow {
            width: 100%;
            align-items: stretch;
          }
          .generate-btn {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
