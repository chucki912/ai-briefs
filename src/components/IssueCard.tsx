'use client';

import { IssueItem } from '@/types';

interface IssueCardProps {
    issue: IssueItem;
    index: number;
    onDeepDive?: (issue: IssueItem) => void;
}

// URL을 축약된 형태로 변환하는 헬퍼 함수
const formatUrl = (url: string) => {
    try {
        const parsed = new URL(url);
        // www. 제거하고 hostname만 반환
        return parsed.hostname.replace(/^www\./, '');
    } catch (e) {
        return url;
    }
};

export default function IssueCard({ issue, index, onDeepDive }: IssueCardProps) {
    return (
        <article className="issue-card animate-in">
            <div className="issue-header-row">
                <div className="issue-tag-group">
                    <span className="issue-number">ISSUE {index + 1}</span>
                    <span className="issue-category-tag">{issue.framework.split(',')[0]}</span>
                </div>
                {onDeepDive && (
                    <button
                        className="btn-text-icon"
                        onClick={() => onDeepDive(issue)}
                        title="이 뉴스를 심층 분석하여 트렌드 리포트를 생성합니다"
                    >
                        <span className="icon">📊</span>
                        <span className="text">심층 리포트</span>
                    </button>
                )}
            </div>

            <h2 className="issue-headline">{issue.headline}</h2>

            <ul className="issue-facts">
                {issue.keyFacts.map((fact, i) => (
                    <li key={i}>{fact}</li>
                ))}
            </ul>

            <div className="issue-insight-container">
                <div className="issue-insight-label">
                    <span className="insight-sparkle">✨</span>
                    STRATEGIC INSIGHT
                </div>
                <div className="issue-insight-content">
                    {issue.insight}
                </div>
            </div>

            <div className="issue-footer">
                <div className="issue-sources">
                    <span className="sources-label">SOURCE NETWORK</span>
                    <div className="sources-list">
                        {issue.sources.map((source, i) => (
                            <a
                                key={i}
                                href={source}
                                className="source-link-chip"
                                target="_blank"
                                rel="noopener noreferrer"
                                title={source}
                            >
                                <span className="source-dot"></span>
                                {formatUrl(source)}
                            </a>
                        ))}
                    </div>
                </div>
            </div>

            <style jsx>{`
                .issue-card {
                    background: var(--bg-card);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid var(--border-color);
                    border-radius: 24px;
                    padding: 2rem;
                    margin-bottom: 2rem;
                    box-shadow: var(--shadow-md);
                    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    position: relative;
                    overflow: hidden;
                }

                .issue-card:hover {
                    transform: translateY(-8px);
                    box-shadow: var(--shadow-lg);
                    border-color: var(--accent-color);
                }

                .animate-in {
                    animation: fadeInUp 0.6s ease-out forwards;
                    opacity: 0;
                }

                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .issue-header-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.5rem;
                }

                .issue-tag-group {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }

                .issue-number {
                    background: var(--accent-color);
                    color: white;
                    font-size: 0.7rem;
                    font-weight: 800;
                    padding: 4px 12px;
                    border-radius: 99px;
                    letter-spacing: 0.05em;
                }

                .issue-category-tag {
                    color: var(--accent-color);
                    background: var(--accent-light);
                    font-size: 0.7rem;
                    font-weight: 700;
                    padding: 4px 12px;
                    border-radius: 99px;
                }

                .btn-text-icon {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 6px 14px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    color: var(--text-primary);
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .btn-text-icon:hover {
                    background: var(--accent-color);
                    color: white;
                    border-color: var(--accent-color);
                    transform: scale(1.05);
                }

                .issue-headline {
                    font-size: 1.5rem;
                    font-weight: 800;
                    color: var(--text-primary);
                    margin-bottom: 1.5rem;
                    line-height: 1.35;
                    letter-spacing: -0.02em;
                }

                .issue-facts {
                    list-style: none;
                    margin-bottom: 2rem;
                    padding: 0;
                }

                .issue-facts li {
                    position: relative;
                    padding-left: 1.5rem;
                    margin-bottom: 0.75rem;
                    color: var(--text-secondary);
                    font-size: 1rem;
                    line-height: 1.6;
                }

                .issue-facts li::before {
                    content: "";
                    position: absolute;
                    left: 0;
                    top: 0.6em;
                    width: 6px;
                    height: 6px;
                    background: var(--accent-color);
                    border-radius: 50%;
                }

                .issue-insight-container {
                    background: var(--insight-bg);
                    padding: 1.5rem;
                    border-radius: 20px;
                    color: white;
                    margin-bottom: 2rem;
                    box-shadow: 0 8px 16px -4px rgba(79, 70, 229, 0.3);
                }

                .issue-insight-label {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.75rem;
                    font-weight: 800;
                    margin-bottom: 0.75rem;
                    letter-spacing: 0.1em;
                    opacity: 0.9;
                }

                .insight-sparkle {
                    font-size: 1rem;
                }

                .issue-insight-content {
                    font-size: 1.05rem;
                    line-height: 1.6;
                    font-weight: 500;
                }

                .issue-footer {
                    border-top: 1px dashed var(--border-color);
                    padding-top: 1.5rem;
                }

                .sources-label {
                    display: block;
                    font-size: 0.7rem;
                    font-weight: 800;
                    color: var(--text-muted);
                    margin-bottom: 0.75rem;
                    letter-spacing: 0.05em;
                }

                .sources-list {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                }

                .source-link-chip {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: var(--bg-secondary);
                    color: var(--text-secondary);
                    padding: 4px 12px;
                    border-radius: 8px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    text-decoration: none;
                    transition: all 0.2s;
                    border: 1px solid transparent;
                }

                .source-link-chip:hover {
                    background: var(--accent-light);
                    color: var(--accent-color);
                    border-color: var(--accent-color);
                }

                .source-dot {
                    width: 4px;
                    height: 4px;
                    background: currentColor;
                    border-radius: 50%;
                    opacity: 0.5;
                }
            `}</style>
        </article>
    );
}

