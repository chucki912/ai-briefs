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
    onRetry?: () => void;
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

export default function TrendReportModal({ isOpen, onClose, report, loading, issue, onRetry }: TrendReportModalProps) {
    const [parsedReport, setParsedReport] = useState<TrendReportData | null>(null);
    const [parseError, setParseError] = useState(false);
    const [showCopyToast, setShowCopyToast] = useState(false);

    useEffect(() => {
        if (!loading && report) {
            try {
                let cleanJson = report.trim();
                cleanJson = cleanJson.replace(/```json\n?|```/g, '').trim();
                const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
                if (!jsonMatch) throw new Error('No JSON object found');
                let jsonString = jsonMatch[0];
                jsonString = jsonString.replace(/,\s*([\}\]])/g, '$1');
                jsonString = jsonString.replace(/(\]|\})\s*\"(\s*[\}\],])/g, '$1$2');
                const data = JSON.parse(jsonString);
                if (data && data.report_meta) {
                    data.report_meta.generated_at = new Date().toISOString();
                }
                setParsedReport(data);
                setParseError(false);
            } catch (e) {
                console.warn('Failed to parse report as JSON:', e);
                setParsedReport(null);
                setParseError(true);
            }
        } else {
            setParsedReport(null);
            setParseError(false);
        }
    }, [report, loading]);

    const getSourceInfo = (src: any) => {
        let url = src.url || '#';
        let title = src.title || '출처 기사';
        return { url, title };
    };

    const handleCopy = () => {
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
                    parsedReport.implications.market_business?.forEach(s => textToCopy += `- [Market] ${s?.text || ''}\n`);
                    parsedReport.implications.tech_product?.forEach(s => textToCopy += `- [Tech] ${s?.text || ''}\n`);
                    parsedReport.implications.competitive_landscape?.forEach(s => textToCopy += `- [Comp] ${s?.text || ''}\n`);
                    parsedReport.implications.policy_regulation?.forEach(s => textToCopy += `- [Policy] ${s?.text || ''}\n`);
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
                textToCopy = report;
            }
        }
        navigator.clipboard.writeText(textToCopy);
        setShowCopyToast(true);
        setTimeout(() => setShowCopyToast(false), 2000);
    };

    if (!isOpen) return null;

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
                    ) : (
                        <div className="markdown-content">
                            <ReactMarkdown>{report}</ReactMarkdown>
                        </div>
                    )}
                </div>

                {!loading && (
                    <div className="modal-footer">
                        <button className="btn btn-secondary" onClick={handleCopy}>
                            📋 텍스트로 복사
                        </button>
                        <button className="btn" onClick={onClose}>닫기</button>
                    </div>
                )}

                {showCopyToast && (
                    <div className="copy-toast">
                        복사 완료
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
                    width: 90%; max-width: 800px; height: 85vh;
                    border-radius: 12px; display: flex; flex-direction: column;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                }
                .modal-header {
                    padding: 1.5rem; border-bottom: 1px solid var(--border-color);
                    display: flex; justify-content: space-between; align-items: center;
                }
                .modal-header h2 { font-size: 1.25rem; margin: 0; }
                .close-btn {
                    background: none; border: none; font-size: 2rem;
                    color: var(--text-secondary); cursor: pointer; padding: 0; line-height: 1;
                }
                .modal-body { flex: 1; overflow-y: auto; padding: 2rem; }
                .modal-footer {
                    padding: 1rem 1.5rem; border-top: 1px solid var(--border-color);
                    display: flex; justify-content: flex-end; gap: 1rem;
                }
                .loading-state {
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    height: 100%; gap: 1rem; color: var(--text-secondary);
                }
                .loading-tip { font-size: 0.9rem; opacity: 0.8; }
                .markdown-content { line-height: 1.7; color: var(--text-primary); }
                .markdown-content :global(p) { margin-bottom: 1rem; }
                
                .copy-toast {
                    position: fixed; left: 50%; top: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(0, 0, 0, 0.8); color: white;
                    padding: 0.75rem 1.5rem; border-radius: 9999px;
                    font-size: 0.9rem; font-weight: 500; z-index: 2000;
                    pointer-events: none;
                    animation: fadeInOut 2s ease-in-out forwards;
                    backdrop-filter: blur(4px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                }

                @keyframes fadeInOut {
                    0% { opacity: 0; transform: translate(-50%, -40%); }
                    10% { opacity: 1; transform: translate(-50%, -50%); }
                    90% { opacity: 1; transform: translate(-50%, -50%); }
                    100% { opacity: 0; transform: translate(-50%, -60%); }
                }
            `}</style>
        </div>
    );
}
