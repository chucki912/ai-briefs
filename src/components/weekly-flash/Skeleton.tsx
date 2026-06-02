'use client';

/** 생성 중 로딩 스켈레톤 (카드 3개 + 진행 메시지) */
export default function Skeleton() {
  return (
    <div className="skeleton-wrap" aria-busy="true" aria-live="polite">
      <p className="progress">웹 검색으로 최근 1주일 AI 뉴스를 확인하고 단신을 작성 중입니다…</p>
      {[0, 1, 2].map((i) => (
        <div className="sk-card" key={i}>
          <div className="sk-line w40" />
          <div className="sk-line w70" />
          <div className="sk-block" />
          <div className="sk-line w90" />
          <div className="sk-line w60" />
        </div>
      ))}

      <style jsx>{`
        .skeleton-wrap {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .progress {
          text-align: center;
          font-weight: 700;
          color: var(--text-secondary);
          animation: pulse 2s ease-in-out infinite;
        }
        .sk-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 18px;
          padding: 1.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .sk-line,
        .sk-block {
          background: linear-gradient(
            90deg,
            var(--bg-secondary) 25%,
            var(--border-color) 37%,
            var(--bg-secondary) 63%
          );
          background-size: 400% 100%;
          border-radius: 8px;
          animation: shimmer 1.4s ease infinite;
        }
        .sk-line {
          height: 14px;
        }
        .sk-block {
          height: 56px;
        }
        .w40 {
          width: 40%;
        }
        .w60 {
          width: 60%;
        }
        .w70 {
          width: 70%;
        }
        .w90 {
          width: 90%;
        }
        @keyframes shimmer {
          0% {
            background-position: 100% 0;
          }
          100% {
            background-position: 0 0;
          }
        }
        @keyframes pulse {
          0%,
          100% {
            opacity: 0.6;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
