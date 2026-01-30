'use client';

import { IssueItem } from '@/types';

interface IssueCardProps {
    issue: IssueItem;
    index: number;
}

export default function IssueCard({ issue, index }: IssueCardProps) {
    return (
        <article className="issue-card">
            <span className="issue-number">이슈 {index + 1}</span>
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
        </article>
    );
}
