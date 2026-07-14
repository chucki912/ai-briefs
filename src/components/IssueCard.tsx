'use client';

import { useState } from 'react';
import { logger } from '@/lib/logger';
import { IssueItem } from '@/types';
import { useBriefCart } from '@/contexts/BriefCartContext';
import { useAuth } from '@/contexts/AuthContext';
import { stripVerificationTag } from '@/lib/text';

interface IssueCardProps {
    issue: IssueItem;
    index: number;
    onDeepDive?: (issue: IssueItem) => void;
    isSelectionMode?: boolean;
    isSelected?: boolean;
    onSelect?: () => void;
    briefDate?: string;
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

export default function IssueCard({ issue, index, onDeepDive, isSelectionMode, isSelected, onSelect, briefDate }: IssueCardProps) {
    const { isAdmin } = useAuth();
    const { addToCart, removeFromCart, isInCart } = useBriefCart();
    const inCart = isInCart(issue.headline);
    const [isCopied, setIsCopied] = useState(false);

    const handleCartToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (inCart) {
            removeFromCart(issue.headline);
        } else {
            addToCart(issue, briefDate || 'Unknown Date');
        }
    };

    const handleDeepDiveClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onDeepDive) {
            onDeepDive(issue);
            logger.generateReport(issue.headline, issue.headline); // Temporary use headline as ID? No, we don't have ID. Use headline as ID for now.
        }
    };

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();

        const factsText = issue.keyFacts.map(fact => `- ${stripVerificationTag(fact)}`).join('\n');
        const tagsText = issue.hashtags ? issue.hashtags.map(tag => `#${tag}`).join(' ') : '';
        const sourcesText = issue.sources.map(source => `- ${source}`).join('\n');

        let soWhatText = '';
        if (issue.soWhat) {
            soWhatText = `\n■ So What (의사결정 판단)
- 이 신호가 사실이라면: ${issue.soWhat.ifTrue}
- 아직 불확실한 것: ${issue.soWhat.uncertain}
- 합리적 베팅: ${issue.soWhat.bet}
- 틀렸을 때의 비용: ${issue.soWhat.downside}
`;
        }

        const contentToCopy = `[${issue.category || issue.framework || 'Issue'}] ${issue.headline}
${issue.oneLineSummary ? `\n> ${issue.oneLineSummary}\n` : ''}
■ Key Facts
${factsText}

■ Strategic Insight
${issue.insight}
${soWhatText}${tagsText ? `\n${tagsText}` : ''}

■ Sources
${sourcesText}`;

        navigator.clipboard.writeText(contentToCopy).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            alert('클립보드 복사에 실패했습니다.');
        });
    };

    return (
        <article
            className={`issue-card animate-in ${isSelectionMode ? 'selection-mode' : ''} ${isSelected ? 'selected' : ''}`}
            onClick={isSelectionMode ? onSelect : undefined}
        >
            {isSelectionMode && (
                <div className="selection-checkbox">
                    {isSelected && <span className="check-mark">✓</span>}
                </div>
            )}
            <div className="issue-header-row">
                <div className="issue-tag-group">
                    <span className="issue-number">ISSUE {index + 1}</span>
                </div>
                <div className="actions-group" style={{ display: 'flex', gap: '8px' }}>
                    <button
                        className={`btn-icon-only ${isCopied ? 'copied' : ''}`}
                        onClick={handleCopy}
                        title="이 브리프 내용 복사하기"
                    >
                        {isCopied ? "✓" : "📋"}
                    </button>
                    {/* 장바구니 버튼 숨김 처리
                    <button
                        className={`btn-icon-only ${inCart ? 'active' : ''}`}
                        onClick={handleCartToggle}
                        title={inCart ? "리포트 카트에서 제거" : "리포트 카트에 담기"}
                    >
                        {inCart ? "🛒✓" : "🛒+"}
                    </button>
                    */}
                    {onDeepDive && isAdmin && (
                        <button
                            className="btn-text-icon"
                            onClick={handleDeepDiveClick}
                            title="이 뉴스를 심층 분석하여 트렌드 리포트를 생성합니다"
                        >
                            <span className="icon">📊</span>
                            <span className="text">심층 리포트</span>
                        </button>
                    )}
                </div>
            </div>

            <h2 className="issue-headline">{issue.headline}</h2>
            {issue.oneLineSummary && <p className="issue-summary">{issue.oneLineSummary}</p>}

            <ul className="issue-facts">
                {issue.keyFacts.map((fact, i) => (
                    <li key={i}>{stripVerificationTag(fact)}</li>
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

            {issue.soWhat && (
                <div className="so-what-container">
                    <div className="so-what-header">
                        <span className="so-what-sparkle">🎯</span>
                        SO WHAT (의사결정 판단 프레임)
                    </div>
                    <div className="so-what-grid">
                        <div className="so-what-item">
                            <span className="so-what-label">이 신호가 사실이라면</span>
                            <p className="so-what-text">{issue.soWhat.ifTrue}</p>
                        </div>
                        <div className="so-what-item">
                            <span className="so-what-label">아직 불확실한 것</span>
                            <p className="so-what-text">{issue.soWhat.uncertain}</p>
                        </div>
                        <div className="so-what-item">
                            <span className="so-what-label">합리적 베팅</span>
                            <p className="so-what-text">{issue.soWhat.bet}</p>
                        </div>
                        <div className="so-what-item">
                            <span className="so-what-label">틀렸을 때의 비용</span>
                            <p className="so-what-text">{issue.soWhat.downside}</p>
                        </div>
                    </div>
                </div>
            )}

            {issue.hashtags && issue.hashtags.length > 0 && (
                <div className="issue-hashtags">
                    {issue.hashtags.map((tag, i) => (
                        <span key={i} className="hashtag">{tag}</span>
                    ))}
                </div>
            )}

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
                                onClick={() => logger.clickSource(source, issue.headline)}
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

                .issue-category-tag.secondary {
                    background: var(--bg-secondary);
                    color: var(--text-secondary);
                    border: 1px solid var(--border-color);
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
                    margin-bottom: 0.5rem;
                    line-height: 1.35;
                    letter-spacing: -0.02em;
                    user-select: text;
                    -webkit-user-select: text;
                }

                .issue-summary {
                    font-size: 1.1rem;
                    color: var(--text-primary);
                    margin-top: 0;
                    margin-bottom: 1.5rem;
                    line-height: 1.5;
                    font-weight: 600;
                    letter-spacing: -0.01em;
                    border-left: 3px solid var(--accent-color);
                    padding-left: 10px;
                    user-select: text;
                    -webkit-user-select: text;
                }

                .btn-icon-only {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    width: 36px;
                    height: 36px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.1rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    color: var(--text-secondary);
                }

                .btn-icon-only:hover {
                    background: var(--accent-light);
                    color: var(--accent-color);
                    border-color: var(--accent-color);
                    transform: scale(1.1);
                }

                .btn-icon-only.active {
                    background: var(--accent-color);
                    color: white;
                    border-color: var(--accent-color);
                }

                .issue-facts {
                    list-style: none;
                    margin-bottom: 2rem;
                    padding: 0;
                    user-select: text;
                    -webkit-user-select: text;
                }

                .issue-facts li {
                    position: relative;
                    padding-left: 1.5rem;
                    margin-bottom: 0.75rem;
                    color: var(--text-secondary);
                    font-size: 1rem;
                    line-height: 1.6;
                    user-select: text;
                    -webkit-user-select: text;
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

                .so-what-container {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    padding: 1.5rem;
                    border-radius: 20px;
                    margin-bottom: 2rem;
                    box-shadow: var(--shadow-sm);
                }

                .so-what-header {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.75rem;
                    font-weight: 800;
                    margin-bottom: 1rem;
                    letter-spacing: 0.1em;
                    color: var(--text-primary);
                }

                .so-what-sparkle {
                    font-size: 1rem;
                }

                .so-what-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1.25rem;
                }

                .so-what-item {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .so-what-label {
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: var(--accent-color);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .so-what-text {
                    font-size: 0.95rem;
                    line-height: 1.5;
                    color: var(--text-primary);
                    margin: 0;
                    font-weight: 500;
                }

                @media (max-width: 640px) {
                    .so-what-grid {
                        grid-template-columns: 1fr;
                        gap: 1rem;
                    }
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
                    user-select: text;
                    -webkit-user-select: text;
                }

                .issue-hashtags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-bottom: 1.5rem;
                }

                .hashtag {
                    color: var(--accent-color);
                    font-size: 0.85rem;
                    font-weight: 600;
                    background: rgba(79, 70, 229, 0.05);
                    padding: 4px 10px;
                    border-radius: 6px;
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

                @media (max-width: 480px) {
                    .issue-card {
                        padding: 1.25rem;
                        border-radius: 20px;
                        margin-bottom: 1.5rem;
                    }

                    .issue-header-row {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 12px;
                        margin-bottom: 1rem;
                    }

                    .issue-tag-group {
                        width: 100%;
                        justify-content: flex-start; /* Changed from space-between to keep tags together */
                        gap: 8px;
                        flex-wrap: wrap;
                    }

                    .actions-group {
                        width: 100%;
                        justify-content: flex-start;
                        margin-top: 0.5rem;
                    }

                    .btn-text-icon {
                        flex: 1; /* Make deep dive button take available space */
                        justify-content: center;
                        padding: 12px;
                        height: 44px; /* Standard touch target height */
                        font-size: 0.95rem;
                    }

                    .btn-icon-only {
                        width: 44px;
                        height: 44px;
                        font-size: 1.1rem;
                    }

                    .issue-headline {
                        font-size: 1.3rem;
                        margin-bottom: 1.25rem;
                        line-height: 1.4;
                        word-break: keep-all; 
                    }

                    .selection-checkbox {
                        top: 1.25rem;
                        right: 1.25rem;
                        width: 22px;
                        height: 22px;
                    }
                }

                .selection-mode {
                    cursor: pointer;
                    border: 2px solid transparent;
                }

                .selection-mode:hover {
                    border-color: var(--accent-light);
                }

                .selected {
                    border-color: var(--accent-color) !important;
                    background: rgba(79, 70, 229, 0.05);
                }

                .selection-checkbox {
                    position: absolute;
                    top: 1.5rem;
                    right: 1.5rem;
                    width: 24px;
                    height: 24px;
                    border: 2px solid var(--border-color);
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    background: var(--bg-card);
                    z-index: 10;
                }

                .selected .selection-checkbox {
                    background: var(--accent-color);
                    border-color: var(--accent-color);
                    color: white;
                }

                .check-mark {
                    font-size: 14px;
                    font-weight: bold;
                }
            `}</style>
        </article>
    );
}

