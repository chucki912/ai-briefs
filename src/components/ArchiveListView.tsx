'use client';

import { useState, useMemo } from 'react';
import { IssueItem } from '@/types';

interface ArchiveListViewProps {
    briefs: any[];
    selectedIssues: IssueItem[];
    onToggleSelection: (issue: IssueItem) => void;
    accentColor?: string;
    isSelectionMode: boolean;
}

export default function ArchiveListView({
    briefs,
    selectedIssues,
    onToggleSelection,
    accentColor = 'var(--accent-color)',
    isSelectionMode
}: ArchiveListViewProps) {
    const [searchQuery, setSearchQuery] = useState('');

    // Flatten all issues from all briefs
    const allIssues = useMemo(() => {
        const flattened: (IssueItem & { date: string, dayOfWeek: string })[] = [];
        briefs.forEach(brief => {
            if (brief.issues) {
                brief.issues.forEach((issue: IssueItem) => {
                    flattened.push({
                        ...issue,
                        date: brief.date,
                        dayOfWeek: brief.dayOfWeek
                    });
                });
            }
        });
        return flattened;
    }, [briefs]);

    // Filter issues based on search query
    const filteredIssues = useMemo(() => {
        if (!searchQuery.trim()) return allIssues;
        const query = searchQuery.toLowerCase();
        return allIssues.filter(issue =>
            (issue.headline && issue.headline.toLowerCase().includes(query)) ||
            (issue.keyFacts && issue.keyFacts.some(fact => fact && fact.toLowerCase().includes(query))) ||
            (issue.insight && issue.insight.toLowerCase().includes(query)) ||
            (issue.framework && issue.framework.toLowerCase().includes(query))
        );
    }, [allIssues, searchQuery]);

    const isIssueSelected = (headline: string) => {
        return selectedIssues.some(i => i.headline === headline);
    };

    return (
        <div className="list-view-container animate-in">
            <div className="search-bar">
                <span className="search-icon">🔍</span>
                <input
                    type="text"
                    placeholder="관심 기사 제목이나 내용을 검색하세요..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            <div className="headline-list">
                {filteredIssues.length > 0 ? (
                    filteredIssues.map((issue, idx) => (
                        <div
                            key={`${issue.date}-${idx}`}
                            className={`headline-item ${isIssueSelected(issue.headline) ? 'selected' : ''}`}
                            onClick={() => isSelectionMode && onToggleSelection(issue)}
                        >
                            {isSelectionMode && (
                                <div className="checkbox-section">
                                    <div className="checkbox-wrapper">
                                        <input
                                            type="checkbox"
                                            checked={isIssueSelected(issue.headline)}
                                            onChange={() => onToggleSelection(issue)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        <span className="checkmark" />
                                    </div>
                                </div>
                            )}
                            <div className="content-section">
                                <div className="headline-meta">
                                    <span className="date-tag">{issue.date} ({issue.dayOfWeek.charAt(0)})</span>
                                    <span className="category-tag" style={{ color: accentColor }}>{issue.framework}</span>
                                </div>
                                <h3 className="headline-text">{issue.headline}</h3>
                                <div className="headline-footer">
                                    <span className="source-tag">{issue.sources && issue.sources[0]}</span>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="no-results">
                        <span className="no-results-icon">∅</span>
                        <p>검색 결과가 없습니다.</p>
                    </div>
                )}
            </div>

            <style jsx>{`
                .list-view-container {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }
                .search-bar {
                    display: flex;
                    align-items: center;
                    background: var(--bg-secondary);
                    border: 1.5px solid var(--border-color);
                    border-radius: 16px;
                    padding: 0 1.25rem;
                    transition: all 0.2s;
                }
                .search-bar:focus-within {
                    border-color: ${accentColor};
                    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
                }
                .search-icon {
                    font-size: 1.1rem;
                    color: var(--text-muted);
                    margin-right: 0.75rem;
                }
                .search-bar input {
                    flex: 1;
                    background: none;
                    border: none;
                    padding: 1rem 0;
                    font-size: 1rem;
                    color: var(--text-primary);
                    outline: none;
                    font-weight: 500;
                }
                
                .headline-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                    max-height: 800px;
                    overflow-y: auto;
                    padding-right: 8px;
                    padding-left: 4px; /* Space for highlights */
                }
                .headline-list::-webkit-scrollbar { width: 6px; }
                .headline-list::-webkit-scrollbar-track { background: transparent; }
                .headline-list::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 10px; }

                .headline-item {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 16px;
                    padding: 1.25rem;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    display: flex;
                    flex-direction: row;
                    gap: 1rem;
                    align-items: flex-start;
                    position: relative;
                }
                .headline-item:hover {
                    transform: translateX(4px);
                    border-color: ${accentColor};
                    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
                }
                .headline-item.selected {
                    background: var(--bg-card);
                    border-color: ${accentColor};
                    box-shadow: 0 0 0 1px ${accentColor};
                }

                .checkbox-section {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding-top: 2px;
                }

                .checkbox-wrapper {
                    position: relative;
                    width: 24px;
                    height: 24px;
                    flex-shrink: 0;
                }
                
                .content-section {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }

                /* Custom Checkbox */
                .checkbox-wrapper input {
                    position: absolute;
                    opacity: 0;
                    cursor: pointer;
                    height: 24px; width: 24px;
                    z-index: 2;
                }
                .checkmark {
                    position: absolute;
                    top: 0; left: 0;
                    height: 24px;
                    width: 24px;
                    background-color: var(--bg-secondary);
                    border: 2px solid var(--border-color);
                    border-radius: 6px;
                    display: block;
                    transition: all 0.2s;
                    z-index: 1;
                }
                .headline-item.selected .checkmark {
                    background-color: ${accentColor};
                    border-color: ${accentColor};
                }
                .checkmark:after {
                    content: "";
                    position: absolute;
                    display: none;
                    left: 7px; top: 3px;
                    width: 5px; height: 10px;
                    border: solid white;
                    border-width: 0 2.5px 2.5px 0;
                    transform: rotate(45deg);
                }
                .headline-item.selected .checkmark:after { display: block; }

                .headline-meta {
                    display: flex;
                    gap: 0.75rem;
                    align-items: center;
                }
                .date-tag {
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: var(--text-muted);
                    background: rgba(0,0,0,0.05);
                    padding: 2px 8px;
                    border-radius: 6px;
                }
                .category-tag {
                    font-size: 0.75rem;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.02em;
                }
                .headline-text {
                    font-size: 1.05rem;
                    font-weight: 700;
                    margin: 0;
                    line-height: 1.4;
                    color: var(--text-primary);
                    word-wrap: break-word;
                    word-break: keep-all;
                }
                .headline-footer {
                    display: flex;
                    justify-content: flex-end;
                }
                .source-tag {
                    font-size: 0.7rem;
                    color: var(--text-muted);
                    font-weight: 600;
                    word-break: break-all;
                }

                .no-results {
                    text-align: center;
                    padding: 4rem 2rem;
                    color: var(--text-muted);
                }
                .no-results-icon {
                    font-size: 3rem;
                    display: block;
                    margin-bottom: 1rem;
                    opacity: 0.3;
                }

                @media (max-width: 480px) {
                    .list-view-container {
                        gap: 1rem;
                    }
                    .search-bar {
                        padding: 0 1rem;
                    }
                    .search-bar input {
                        padding: 0.75rem 0;
                        font-size: 0.9rem;
                    }
                    .headline-item {
                        padding: 1rem;
                        gap: 0.75rem;
                    }
                    .checkbox-wrapper {
                        width: 20px;
                        height: 20px;
                    }
                    .checkmark {
                        width: 20px;
                        height: 20px;
                    }
                    .checkmark:after {
                        left: 6px; top: 2px;
                        width: 4px; height: 8px;
                    }
                    .headline-text {
                        font-size: 0.95rem;
                    }
                    .date-tag, .category-tag {
                        font-size: 0.7rem;
                    }
                }
            `}</style>
        </div>
    );
}
