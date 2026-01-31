'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { IssueItem } from '@/types';

interface TrendReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    report: string;
    loading: boolean;
    issue?: IssueItem;
}

// JSON Schema Types
interface TrendReportData {
    report_meta: {
        title: string;
        time_window: string;
        coverage: string;
        audience: string;
        lens: string;
        generated_at: string;
    };
    executive_summary: {
        signal_summary: Statement[];
        what_changed: Statement[];
        so_what: Statement[];
    };
    key_developments: {
        headline: string;
        facts: Fact[];
        analysis: Inference[];
        why_it_matters: Statement[];
        evidence_level: 'high' | 'medium' | 'low';
        citations: string[];
    }[];
    themes: {
        theme: string;
        drivers: Statement[];
        supporting_developments: string[];
        citations: string[];
    }[];
    implications: {
        market_business: Statement[];
        tech_product: Statement[];
        policy_regulation: Statement[];
        competitive_landscape: Statement[];
    };
    risks_and_uncertainties: {
        risk: string;
        type: string;
        impact_paths: Statement[];
        evidence_level: 'high' | 'medium' | 'low';
    }[];
    watchlist: {
        signal: string;
        why: string;
        how_to_monitor: string;
    }[];
    sources: {
        sid: string;
        publisher: string;
        date: string;
        title: string;
        url: string;
    }[];
    quality?: {
        coverage_gaps?: string[];
        conflicts?: string[];
    };
}

interface Statement {
    text: string;
    citations: string[];
}

interface Fact {
    text: string;
    citations: string[];
}

interface Inference {
    text: string;
    basis: string;
    citations: string[];
}

export default function TrendReportModal({ isOpen, onClose, report, loading, issue }: TrendReportModalProps) {
    const [parsedReport, setParsedReport] = useState<TrendReportData | null>(null);
    const [parseError, setParseError] = useState(false);

    useEffect(() => {
        if (!loading && report) {
            try {
                // Try to parse as JSON
                // Clean up markdown code blocks if present
                const cleanJson = report.replace(/```json\n|\n```/g, '').trim();
                // Handle potential multiple JSON objects or text before/after
                const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
                const jsonString = jsonMatch ? jsonMatch[0] : cleanJson;

                const data = JSON.parse(jsonString);
                setParsedReport(data);
                setParseError(false);
            } catch (e) {
                console.warn('Failed to parse report as JSON, falling back to Markdown', e);
                setParsedReport(null);
                setParseError(true);
            }
        } else {
            setParsedReport(null);
            setParseError(false);
        }
    }, [report, loading]);

    if (!isOpen) return null;

    // Helper to get correct URL and Title for a source
    const getSourceInfo = (src: { sid: string; url: string; title: string }) => {
        let finalUrl = src.url;
        let finalTitle = src.title;

        // Try to match [S#] to the original issue sources if available
        if (issue && issue.sources && issue.sources.length > 0) {
            const match = src.sid.match(/^S(\d+)$/);
            if (match) {
                const index = parseInt(match[1], 10) - 1;
                if (index >= 0 && index < issue.sources.length) {
                    finalUrl = issue.sources[index];
                }
            }
        }

        // Title Cleanup
        if (!finalTitle || finalTitle.includes('Google News') || finalTitle.includes('RSS Feed')) {
            try {
                finalTitle = new URL(finalUrl).hostname;
            } catch {
                finalTitle = finalUrl;
            }
        }

        return { url: finalUrl, title: finalTitle };
    };

    const Citation = ({ ids }: { ids: string[] }) => {
        if (!ids || !Array.isArray(ids) || ids.length === 0) return null;
        return (
            <span className="citations">
                {ids.map((id, index) => (
                    <a key={`${id}-${index}`} href={`#source-${id}`} className="citation-tag" onClick={(e) => {
                        e.preventDefault();
                        const el = document.getElementById(`source-${id}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}>
                        {id}
                    </a>
                ))}
            </span>
        );
    };

    const StatementItem = ({ item }: { item: Statement | Fact }) => {
        if (!item) return null;
        return (
            <li className="statement-item">
                <span className="statement-text">{item.text}</span>
                <Citation ids={item.citations} />
            </li>
        );
    };

    const EvidenceBadge = ({ level }: { level: string }) => {
        const safeLevel = (level || 'low').toLowerCase();
        const colors: Record<string, string> = {
            high: 'bg-green-100 text-green-800',
            medium: 'bg-yellow-100 text-yellow-800',
            low: 'bg-red-100 text-red-800'
        };
        const labels: Record<string, string> = {
            high: 'High Confidence',
            medium: 'Medium Confidence',
            low: 'Low Confidence'
        };

        const colorClass = colors[safeLevel] || colors['low'];
        const label = labels[safeLevel] || 'Unknown Confidence';

        return (
            <span className={`evidence-badge ${safeLevel} ${colorClass}`}>
                {label}
            </span>
        );
    };

    // Helper to safely render date
    const renderDate = (dateString?: string) => {
        if (!dateString) return '-';
        try {
            return new Date(dateString).toLocaleDateString();
        } catch {
            return dateString;
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content report-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>📊 트렌드 센싱 리포트 (Deep Dive)</h2>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <div className="modal-body">
                    {loading ? (
                        <div className="loading-state">
                            <div className="spinner"></div>
                            <p>심층 분석 중입니다... (약 30-60초 소요)</p>
                            <span className="loading-tip">💡 실제 기사 본문을 분석하고 있습니다.</span>
                        </div>
                    ) : parseError ? (
                        <div className="error-state">
                            <div className="error-banner">
                                <h3>⚠️ 리포트 형식을 불러올 수 없습니다.</h3>
                                <p>원본 데이터 형식이 올바르지 않아 기본 텍스트 모드로 표시합니다.</p>
                            </div>
                            <div className="markdown-content">
                                <ReactMarkdown>{report}</ReactMarkdown>
                            </div>
                        </div>
                    ) : parsedReport ? (
                        <div className="report-content">
                            {/* 0. Meta Info */}
                            {parsedReport.report_meta && (
                                <div className="report-meta-card">
                                    <h1>{parsedReport.report_meta.title || '제목 없음'}</h1>
                                    <div className="meta-grid">
                                        <div className="meta-item">
                                            <span className="label">기간</span>
                                            <span className="value">{parsedReport.report_meta.time_window || '-'}</span>
                                        </div>
                                        <div className="meta-item">
                                            <span className="label">관점</span>
                                            <span className="value">{parsedReport.report_meta.lens || '-'}</span>
                                        </div>
                                        <div className="meta-item">
                                            <span className="label">타겟</span>
                                            <span className="value">{parsedReport.report_meta.audience || '-'}</span>
                                        </div>
                                        <div className="meta-item">
                                            <span className="label">생성일</span>
                                            <span className="value">{renderDate(parsedReport.report_meta.generated_at)}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 1. Executive Summary */}
                            {parsedReport.executive_summary && (
                                <section className="report-section">
                                    <h3>🚀 Executive Summary</h3>
                                    <div className="subsection">
                                        <h4>Signal Summary</h4>
                                        <ul>
                                            {parsedReport.executive_summary.signal_summary?.map((s, i) => (
                                                <StatementItem key={i} item={s} />
                                            )) || <li>내용 없음</li>}
                                        </ul>
                                    </div>
                                    <div className="grid-2-col">
                                        <div className="subsection">
                                            <h4>What Changed</h4>
                                            <ul>
                                                {parsedReport.executive_summary.what_changed?.map((s, i) => (
                                                    <StatementItem key={i} item={s} />
                                                )) || <li>내용 없음</li>}
                                            </ul>
                                        </div>
                                        <div className="subsection">
                                            <h4>So What</h4>
                                            <ul>
                                                {parsedReport.executive_summary.so_what?.map((s, i) => (
                                                    <StatementItem key={i} item={s} />
                                                )) || <li>내용 없음</li>}
                                            </ul>
                                        </div>
                                    </div>
                                </section>
                            )}

                            <hr className="divider" />

                            {/* 2. Key Developments */}
                            {parsedReport.key_developments && parsedReport.key_developments.length > 0 && (
                                <section className="report-section">
                                    <h3>🔍 Key Developments</h3>
                                    <div className="development-list">
                                        {parsedReport.key_developments.map((dev, i) => (
                                            <div key={i} className="development-card">
                                                <div className="dev-header">
                                                    <h4>{dev.headline}</h4>
                                                    <EvidenceBadge level={dev.evidence_level} />
                                                </div>

                                                <div className="dev-body">
                                                    <div className="fact-box">
                                                        <h5>Facts</h5>
                                                        <ul>
                                                            {dev.facts?.map((f, fi) => <StatementItem key={fi} item={f} />) || <li>내용 없음</li>}
                                                        </ul>
                                                    </div>
                                                    <div className="analysis-box">
                                                        <h5>Analysis</h5>
                                                        {dev.analysis?.map((inf, ii) => (
                                                            <div key={ii} className="inference-item">
                                                                <p className="inf-text">{inf.text}</p>
                                                                <p className="inf-basis">💡 {inf.basis}</p>
                                                            </div>
                                                        )) || <p className="text-sm text-gray-500">분석 내용 없음</p>}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* 3. Themes */}
                            {parsedReport.themes && parsedReport.themes.length > 0 && (
                                <section className="report-section">
                                    <h3>🌊 Emerging Themes</h3>
                                    <div className="theme-grid">
                                        {parsedReport.themes.map((theme, i) => (
                                            <div key={i} className="theme-card">
                                                <h4>{theme.theme}</h4>
                                                <div className="theme-drivers">
                                                    <h5>Drivers</h5>
                                                    <ul>
                                                        {theme.drivers?.map((d, di) => <StatementItem key={di} item={d} />) || <li>내용 없음</li>}
                                                    </ul>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            <hr className="divider" />

                            {/* 4. Implications */}
                            {parsedReport.implications && (
                                <section className="report-section">
                                    <h3>🎯 Implications</h3>
                                    <div className="implication-grid">
                                        <div className="imp-col">
                                            <h4>Market & Business</h4>
                                            <ul>{parsedReport.implications.market_business?.map((s, i) => <StatementItem key={i} item={s} />) || <li>-</li>}</ul>
                                        </div>
                                        <div className="imp-col">
                                            <h4>Tech & Product</h4>
                                            <ul>{parsedReport.implications.tech_product?.map((s, i) => <StatementItem key={i} item={s} />) || <li>-</li>}</ul>
                                        </div>
                                        <div className="imp-col">
                                            <h4>Competitive Landscape</h4>
                                            <ul>{parsedReport.implications.competitive_landscape?.map((s, i) => <StatementItem key={i} item={s} />) || <li>-</li>}</ul>
                                        </div>
                                        <div className="imp-col">
                                            <h4>Policy & Regulation</h4>
                                            <ul>{parsedReport.implications.policy_regulation?.map((s, i) => <StatementItem key={i} item={s} />) || <li>-</li>}</ul>
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* 5. Risks & Watchlist */}
                            <div className="grid-2-col-wide">
                                {parsedReport.risks_and_uncertainties && (
                                    <section className="report-section">
                                        <h3>⚠️ Risks & Uncertainties</h3>
                                        {parsedReport.risks_and_uncertainties.map((risk, i) => (
                                            <div key={i} className="risk-item">
                                                <h5>{risk.risk} <span className="risk-type">({risk.type})</span></h5>
                                                <ul>
                                                    {risk.impact_paths?.map((p, pi) => <StatementItem key={pi} item={p} />) || <li>-</li>}
                                                </ul>
                                            </div>
                                        ))}
                                    </section>
                                )}

                                {parsedReport.watchlist && (
                                    <section className="report-section">
                                        <h3>🔭 Watchlist (Monitoring)</h3>
                                        <div className="watchlist-table-container">
                                            <table className="watchlist-table">
                                                <thead>
                                                    <tr>
                                                        <th>Signal</th>
                                                        <th>Why Monitor</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {parsedReport.watchlist.map((w, i) => (
                                                        <tr key={i}>
                                                            <td className="signal-cell">
                                                                <strong>{w.signal}</strong>
                                                                <div className="monitor-method">👉 {w.how_to_monitor}</div>
                                                            </td>
                                                            <td>{w.why}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </section>
                                )}
                            </div>

                            <hr className="divider" />

                            {/* Sources */}
                            {parsedReport.sources && (
                                <section className="report-section sources-section">
                                    <h3>📚 Sources</h3>
                                    <div className="sources-list">
                                        {parsedReport.sources.map((src, i) => {
                                            const { url, title } = getSourceInfo(src);
                                            return (
                                                <div key={i} id={`source-${src.sid}`} className="source-item">
                                                    <span className="source-id">[{src.sid}]</span>
                                                    <div className="source-info">
                                                        <a href={url} target="_blank" rel="noopener noreferrer" className="source-title">
                                                            {title}
                                                        </a>
                                                        <div className="source-meta">
                                                            {src.publisher} • {src.date} • <span className="source-url">{url}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}

                        </div>
                    ) : (parseError || report) ? (
                        <div className="markdown-content">
                            {/* Fallback for Markdown or Legacy support */}
                            <ReactMarkdown>{report}</ReactMarkdown>
                        </div>
                    ) : (
                        <div className="loading-state">
                            <p>리포트 내용이 없습니다.</p>
                        </div>
                    )}
                </div>

                {!loading && (
                    <div className="modal-footer">
                        <button
                            className="btn btn-secondary"
                            onClick={() => {
                                let textToCopy = report;
                                if (parsedReport) {
                                    try {
                                        textToCopy = `[트렌드 리포트] ${parsedReport.report_meta.title || ''}\n\n`;
                                        textToCopy += `기간: ${parsedReport.report_meta.time_window || '-'}\n`;
                                        textToCopy += `관점: ${parsedReport.report_meta.lens || '-'}\n\n`;

                                        textToCopy += `■ Executive Summary\n`;
                                        parsedReport.executive_summary.signal_summary?.forEach(s => textToCopy += `- ${s.text}\n`);

                                        if (parsedReport.key_developments?.length) {
                                            textToCopy += `\n■ Key Developments\n`;
                                            parsedReport.key_developments.forEach(d => {
                                                textToCopy += `\n[${d.headline}]\n`;
                                                d.facts?.forEach(f => textToCopy += `- (Fact) ${f.text}\n`);
                                                d.analysis?.forEach(a => textToCopy += `- (Analysis) ${a.text}\n`);
                                            });
                                        }

                                        if (parsedReport.implications) {
                                            textToCopy += `\n■ Implications\n`;
                                            parsedReport.implications.market_business?.forEach(s => textToCopy += `- [Market] ${s.text}\n`);
                                            parsedReport.implications.tech_product?.forEach(s => textToCopy += `- [Tech] ${s.text}\n`);
                                        }

                                        if (parsedReport.sources?.length) {
                                            textToCopy += `\n■ Sources\n`;
                                            parsedReport.sources.forEach(src => {
                                                const { url, title } = getSourceInfo(src);
                                                textToCopy += `[${src.sid}] ${title} (${src.publisher})\n${url}\n`;
                                            });
                                        }
                                    } catch (e) {
                                        console.error('Text formatting failed', e);
                                        textToCopy = report; // Fallback
                                    }
                                }

                                navigator.clipboard.writeText(textToCopy);
                                alert('리포트 텍스트가 복사되었습니다.');
                            }}
                        >
                            📋 텍스트로 복사
                        </button>
                        <button className="btn" onClick={onClose}>닫기</button>
                    </div>
                )}
            </div>
            <style jsx>{`
                .modal-overlay {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    display: flex; justify-content: center; align-items: center;
                    z-index: 1000; padding: 1rem;
                }
                .modal-content.report-modal {
                    background: var(--bg-card);
                    width: 90%; max-width: 1000px; height: 90vh;
                    border-radius: 12px; display: flex; flex-direction: column;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                }
                .modal-header {
                    padding: 1.5rem; border-bottom: 1px solid var(--border-color);
                    display: flex; justify-content: space-between; align-items: center;
                }
                .modal-body {
                    flex: 1; overflow-y: auto; padding: 0;
                    background-color: #f9fafb;
                }
                /* Dark Mode Support for body background */
                @media (prefers-color-scheme: dark) {
                    .modal-body { background-color: #1a1a1a; }
                }

                .report-content {
                    max-width: 800px; margin: 0 auto; padding: 3rem;
                    background: var(--bg-card);
                    box-shadow: 0 0 20px rgba(0,0,0,0.05);
                    min-height: 100%;
                }

                .error-state {
                    padding: 3rem;
                    text-align: center;
                }
                .error-banner {
                    background-color: #fee2e2;
                    border: 1px solid #ef4444;
                    color: #b91c1c;
                    padding: 1rem;
                    border-radius: 8px;
                    margin-bottom: 2rem;
                }
                .error-banner h3 { margin: 0 0 0.5rem 0; font-size: 1.1rem; }
                .error-banner p { margin: 0; font-size: 0.9rem; }

                /* Meta Card */
                .report-meta-card {
                    margin-bottom: 3rem; padding-bottom: 2rem;
                    border-bottom: 2px solid var(--border-color);
                }
                .report-meta-card h1 {
                    font-size: 2rem; margin-bottom: 1.5rem; line-height: 1.3;
                    background: linear-gradient(135deg, #2563eb, #1d4ed8);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .meta-grid {
                    display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 1.5rem;
                }
                .meta-item {
                    display: flex; flex-direction: column; gap: 0.25rem;
                }
                .meta-item .label {
                    font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;
                    color: var(--text-secondary);
                }
                .meta-item .value {
                    font-weight: 600; font-size: 1rem;
                }

                /* Section Styles */
                .report-section { margin-bottom: 3rem; }
                .report-section h3 {
                    font-size: 1.5rem; margin-bottom: 1.5rem;
                    display: flex; align-items: center; gap: 0.5rem;
                    color: var(--text-primary);
                }
                .subsection h4 {
                    font-size: 1.1rem; color: var(--text-secondary); margin-bottom: 0.75rem;
                    border-left: 3px solid #3b82f6; padding-left: 0.75rem;
                }
                
                .statement-item {
                    margin-bottom: 0.75rem; line-height: 1.6;
                    list-style-type: none; position: relative;
                    padding-left: 1.25rem;
                }
                .statement-item::before {
                    content: "•"; position: absolute; left: 0; color: #9ca3af;
                }
                
                .citation-tag {
                    display: inline-block; font-size: 0.75em; vertical-align: super;
                    color: #3b82f6; text-decoration: none; margin-left: 0.25rem;
                    font-weight: 600;
                }
                .citation-tag:hover { text-decoration: underline; }

                /* Fact & Analysis Box */
                .development-card {
                    background: var(--bg-hover);
                    border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem;
                    border: 1px solid var(--border-color);
                }
                .dev-header {
                    display: flex; justify-content: space-between; align-items: start;
                    margin-bottom: 1rem; gap: 1rem;
                }
                .dev-header h4 { margin: 0; font-size: 1.2rem; }
                
                .evidence-badge {
                    font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 9999px;
                    white-space: nowrap; font-weight: 600;
                }
                .evidence-badge.high { background: #dcfce7; color: #166534; }
                .evidence-badge.medium { background: #fef9c3; color: #854d0e; }
                .evidence-badge.low { background: #fee2e2; color: #991b1b; }

                .fact-box { margin-bottom: 1rem; }
                .fact-box h5, .analysis-box h5 {
                    font-size: 0.9rem; text-transform: uppercase; color: var(--text-secondary);
                    margin-bottom: 0.5rem; opacity: 0.7;
                }
                .inf-basis {
                    font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.25rem;
                    font-style: italic;
                }

                /* Grid Layouts */
                .grid-2-col { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
                .grid-2-col-wide { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; }
                
                .theme-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; }
                .theme-card {
                    background: var(--bg-hover); padding: 1.5rem; border-radius: 8px;
                    border-top: 4px solid #8b5cf6;
                }

                .implication-grid {
                    display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;
                }
                .imp-col h4 {
                    font-size: 1.1rem; border-bottom: 1px solid var(--border-color);
                    padding-bottom: 0.5rem; margin-bottom: 1rem;
                }

                /* Watchlist Table */
                .watchlist-table-container { overflow-x: auto; }
                .watchlist-table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
                .watchlist-table th {
                    text-align: left; padding: 0.75rem; border-bottom: 2px solid var(--border-color);
                    color: var(--text-secondary); font-size: 0.85rem;
                }
                .watchlist-table td {
                    padding: 0.75rem; border-bottom: 1px solid var(--border-color); vertical-align: top;
                }
                .monitor-method {
                    font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;
                }

                /* Divider */
                .divider {
                    border: 0; border-top: 1px solid var(--border-color); margin: 3rem 0;
                }

                /* Sources */
                .sources-list { font-size: 0.9rem; }
                .source-item {
                    display: flex; gap: 1rem; margin-bottom: 1rem;
                    padding: 0.75rem; background: var(--bg-hover); border-radius: 6px;
                }
                .source-id {
                    font-weight: bold; color: #3b82f6; min-width: 3rem; flex-shrink: 0;
                }
                .source-info { overflow: hidden; }
                .source-title {
                    font-weight: 600; text-decoration: none; color: var(--text-primary);
                    display: block; margin-bottom: 0.25rem;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .source-title:hover { color: #3b82f6; text-decoration: underline; }
                .source-meta { color: var(--text-secondary); font-size: 0.85rem; }
                .source-url {
                    word-break: break-all;
                    opacity: 0.8;
                }

                /* Mobile Responsive */
                @media (max-width: 768px) {
                    .report-content { padding: 1.5rem; }
                    .grid-2-col, .grid-2-col-wide, .implication-grid { grid-template-columns: 1fr; }
                    .report-meta-card h1 { font-size: 1.5rem; }
                    .modal-content.report-modal { width: 100%; height: 100%; border-radius: 0; }
                }

                .modal-footer {
                    padding: 1rem 1.5rem; border-top: 1px solid var(--border-color);
                    display: flex; justify-content: flex-end; gap: 1rem;
                    background: var(--bg-card);
                }
                .close-btn {
                    background: none; border: none; font-size: 2rem;
                    color: var(--text-secondary); cursor: pointer; padding: 0;
                }
                .loading-state {
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    height: 100%; gap: 1rem; color: var(--text-secondary); padding: 3rem;
                }
                 .markdown-content {
                    padding: 2rem;
                    line-height: 1.6;
                    color: var(--text-primary);
                }
                .markdown-content :global(h1), .markdown-content :global(h2), .markdown-content :global(h3) {
                    margin-top: 1.5rem;
                    margin-bottom: 1rem;
                    color: var(--text-primary);
                }
                .markdown-content :global(p) { margin-bottom: 1rem; }
            `}</style>
        </div>
    );
}
