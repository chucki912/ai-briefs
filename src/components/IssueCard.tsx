'use client';

import { IssueItem } from '@/types';

interface IssueCardProps {
    issue: IssueItem;
    index: number;
    onDeepDive?: (issue: IssueItem) => void;
}

export default function IssueCard({ issue, index, onDeepDive }: IssueCardProps) {
    return (
        <article className="issue-card">
            <div className="issue-header-row">
                <span className="issue-number">이슈 {index + 1}</span>
                {onDeepDive && (
                    <button
                        className="btn-text-icon"
                        onClick={() => onDeepDive(issue)}
                        title="이 뉴스를 심층 분석하여 트렌드 리포트를 생성합니다"
                    >
                        📄 리포트
                    </button>
                )}
            </div>

            <h2 className="issue-headline">{issue.headline}</h2>

            <ul className="issue-facts">
                {issue.keyFacts.map((fact, i) => (
                    <li key={i}>{fact}</li>
                ))}
            </ul>

            <div className="issue-framework">
                📊 분석 프레임워크: {issue.framework}
            </div>

            <div className="issue-insight">
                <div className="issue-insight-label">💡 Insight</div>
                {issue.insight}
            </div>

            <div className="issue-sources">
                <div className="issue-sources-label">🔗 원문</div>
                {issue.sources.map((source, i) => (
                    <a
                        key={i}
                        href={source}
                        className="issue-source-link"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {source}
                    </a>
                ))}
            </div>
            <style jsx>{`
                .issue-header-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.5rem;
                }
                .btn-text-icon {
                    background: none;
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    padding: 0.2rem 0.6rem;
                    font-size: 0.8rem;
                    cursor: pointer;
                    color: var(--primary-color);
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .btn-text-icon:hover {
                    background: var(--bg-hover);
                    border-color: var(--primary-color);
                }
            `}</style>
        </article>
    );
}
