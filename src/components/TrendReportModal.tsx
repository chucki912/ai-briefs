'use client';

import { useState, useEffect, useRef } from 'react';
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

// URL을 축약된 형태로 변환하는 헬퍼 함수
const formatUrl = (url: string) => {
    try {
        const parsed = new URL(url);
        return parsed.hostname.replace(/^www\./, '');
    } catch (e) {
        return url;
    }
};

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
        citations: string[];
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
    quality: {
        coverage_gaps: string[];
        conflicts: string[];
        low_evidence_points: string[];
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

    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const [isPolling, setIsPolling] = useState(false);

    useEffect(() => {
        // 클린업 함수 정의
        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
        };
    }, []);

    const [statusMessage, setStatusMessage] = useState<string>('심층 분석 중입니다... (데이터 양에 따라 1-2분 소요)');
    const [currentStep, setCurrentStep] = useState<'research' | 'synthesize'>('research');

    useEffect(() => {
        if (!loading && report && !issue) {
            processReport(report);
        } else if (isOpen && loading && issue) {
            const fetchTrendReport = async () => {
                setIsPolling(true);
                setCurrentStep('research');
                setStatusMessage('1단계: 심층 리서치 진행 중... (자료 수집)');

                try {
                    // 1. Research 시작 요청
                    const startRes = await fetch('/api/trend-report', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ issue, step: 'research' })
                    });

                    if (!startRes.ok) throw new Error('Failed to start research');
                    const { data: { jobId } } = await startRes.json();

                    // Polling Loop
                    pollIntervalRef.current = setInterval(async () => {
                        try {
                            const statusRes = await fetch(`/api/trend-report/status?jobId=${jobId}`);
                            if (!statusRes.ok) return;

                            const { data: statusData } = await statusRes.json();

                            // 1단계 완료 -> 2단계 시작
                            if (statusData.status === 'research_completed') {
                                if (currentStep === 'research') {
                                    clearInterval(pollIntervalRef.current!);
                                    console.log('Research complete. Starting synthesis...');

                                    setCurrentStep('synthesize');
                                    setStatusMessage('2단계: 리포트 작성 중... (최종 분석)');

                                    // 2단계 요청 (Synthesis)
                                    const synthRes = await fetch('/api/trend-report', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ jobId, step: 'synthesize' })
                                    });

                                    if (!synthRes.ok) throw new Error('Failed to start synthesis');

                                    // Polling 재개 (기존 인터벌 사용 또는 새 인터벌)
                                    // 여기서는 간편하게 interval을 다시 설정
                                    pollIntervalRef.current = setInterval(async () => {
                                        try {
                                            const sRes = await fetch(`/api/trend-report/status?jobId=${jobId}`);
                                            if (!sRes.ok) return;
                                            const { data: sData } = await sRes.json();

                                            if (sData.status === 'completed') {
                                                clearInterval(pollIntervalRef.current!);
                                                processReport(sData.report);
                                                setIsPolling(false);
                                            } else if (sData.status === 'failed') {
                                                throw new Error(sData.error);
                                            }
                                        } catch (e) {
                                            console.error('Polling error (Synthesis)', e);
                                        }
                                    }, 2000);
                                }
                            } else if (statusData.status === 'failed') {
                                throw new Error(statusData.error);
                            } else if (statusData.status === 'completed') {
                                // 혹시 이미 완료된 경우
                                clearInterval(pollIntervalRef.current!);
                                processReport(statusData.report);
                                setIsPolling(false);
                            }

                        } catch (e) {
                            console.error('Polling error', e);
                            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                            setParseError(true);
                            alert('리포트 생성 중 오류 발생');
                            setIsPolling(false);
                            onClose();
                        }
                    }, 2000);

                } catch (e) {
                    console.error('Error starting trend report', e);
                    setParseError(true);
                    setIsPolling(false);
                    onClose();
                }
            };

            fetchTrendReport();
        }
    }, [isOpen, loading, issue, report]);

    // 리포트 파싱 헬퍼
    const processReport = (jsonStr: string) => {
        try {
            let cleanJson = jsonStr.trim();
            cleanJson = cleanJson.replace(/```json\n?|```/g, '').trim();
            const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('No JSON object found');
            let finalJson = jsonMatch[0].replace(/,\s*([\}\]])/g, '$1');

            setParsedReport(JSON.parse(finalJson));
            setParseError(false);
        } catch (e) {
            console.warn('Failed to parse report:', e);
            setParsedReport(null);
            setParseError(true);
        }
    };

    const getSourceInfo = (src: any) => {
        let url = src.url || '#';
        let title = src.title || '출처 기사';
        return { url, title };
    };

    const handleCopy = () => {
        let textToCopy = report;
        if (parsedReport) {
            try {
                textToCopy = `[트렌드 리포트] ${parsedReport.report_meta?.title || ''}\n\n`;
                textToCopy += `분석대상: ${parsedReport.report_meta?.coverage || '-'}\n`;
                textToCopy += `타겟: ${parsedReport.report_meta?.audience || '-'}\n`;
                textToCopy += `기간: ${parsedReport.report_meta?.time_window || '-'}\n`;
                textToCopy += `관점: ${parsedReport.report_meta?.lens || '-'}\n\n`;

                textToCopy += `■ Executive Summary\n`;
                parsedReport.executive_summary?.signal_summary?.forEach(s => textToCopy += `- [Signal] ${s.text}\n`);
                parsedReport.executive_summary?.what_changed?.forEach(s => textToCopy += `- [Change] ${s.text}\n`);
                parsedReport.executive_summary?.so_what?.forEach(s => textToCopy += `- [So What] ${s.text}\n`);

                if (parsedReport.key_developments?.length) {
                    textToCopy += `\n■ Key Developments\n`;
                    parsedReport.key_developments.forEach(d => {
                        textToCopy += `\n[${d.headline}]\n`;
                        d.facts?.forEach(f => textToCopy += `- (Fact) ${f.text}\n`);
                        d.analysis?.forEach(a => textToCopy += `- (Analysis) ${a.text} (Basis: ${a.basis})\n`);
                    });
                }

                if (parsedReport.themes?.length) {
                    textToCopy += `\n■ Core Themes\n`;
                    parsedReport.themes.forEach(t => {
                        textToCopy += `\n[${t.theme}]\n`;
                        t.drivers?.forEach(d => textToCopy += `- (Driver) ${d.text}\n`);
                    });
                }

                if (parsedReport.implications) {
                    textToCopy += `\n■ Implications\n`;
                    parsedReport.implications?.market_business?.forEach(s => textToCopy += `- [Market] ${s?.text || ''}\n`);
                    parsedReport.implications?.tech_product?.forEach(s => textToCopy += `- [Tech] ${s?.text || ''}\n`);
                    parsedReport.implications?.competitive_landscape?.forEach(s => textToCopy += `- [Comp] ${s?.text || ''}\n`);
                    parsedReport.implications?.policy_regulation?.forEach(s => textToCopy += `- [Policy] ${s?.text || ''}\n`);
                }

                if (parsedReport.risks_and_uncertainties?.length) {
                    textToCopy += `\n■ Risks & Uncertainties\n`;
                    parsedReport.risks_and_uncertainties.forEach(r => {
                        textToCopy += `- [${r.type.toUpperCase()}] ${r.risk}\n`;
                    });
                }

                if (parsedReport.watchlist?.length) {
                    textToCopy += `\n■ Watchlist\n`;
                    parsedReport.watchlist.forEach(w => {
                        textToCopy += `- ${w.signal}: ${w.why}\n`;
                    });
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
                    {loading || isPolling ? (
                        <div className="loading-state">
                            <div className="spinner"></div>
                            <p>{statusMessage}</p>
                            <span className="loading-tip">💡 Flash 모델로 자료를 수집하고 Pro 모델로 심층 분석합니다.</span>
                        </div>
                    ) : parsedReport ? (
                        <div className="report-content">
                            <div className="report-meta-box">
                                <h1 className="report-title">{parsedReport.report_meta?.title}</h1>
                                <div className="report-badge-row">
                                    <span className="badge">대상: {parsedReport.report_meta?.coverage}</span>
                                    <span className="badge">기간: {parsedReport.report_meta?.time_window}</span>
                                    <span className="badge">관점: {parsedReport.report_meta?.lens}</span>
                                </div>
                            </div>

                            <section className="report-section">
                                <h2 className="section-title">■ Executive Summary</h2>
                                <div className="summary-group">
                                    <h4>[Signal Summary]</h4>
                                    <ul className="report-list">
                                        {parsedReport.executive_summary?.signal_summary?.map((s, i) => <li key={i}>{s.text}</li>)}
                                    </ul>
                                    <h4>[What Changed]</h4>
                                    <ul className="report-list">
                                        {parsedReport.executive_summary?.what_changed?.map((s, i) => <li key={i}>{s.text}</li>)}
                                    </ul>
                                    <h4>[So What]</h4>
                                    <ul className="report-list">
                                        {parsedReport.executive_summary?.so_what?.map((s, i) => <li key={i}>{s.text}</li>)}
                                    </ul>
                                </div>
                            </section>

                            <section className="report-section">
                                <h2 className="section-title">■ Key Developments</h2>
                                {parsedReport.key_developments?.map((d, i) => (
                                    <div key={i} className="development-item">
                                        <h3 className="development-headline">[{d.headline}]</h3>
                                        <div className="evidence-badge" data-level={d.evidence_level}>Evidence: {d.evidence_level}</div>
                                        <ul className="report-list">
                                            {d.facts?.map((f, fi) => <li key={fi}>- (Fact) {f.text}</li>)}
                                            {d.analysis?.map((a, ai) => (
                                                <li key={ai}>
                                                    - (Analysis) {a.text}
                                                    <div className="analysis-basis">Basis: {a.basis}</div>
                                                </li>
                                            ))}
                                            {d.why_it_matters?.map((w, wi) => <li key={wi}>- (Why) {w.text}</li>)}
                                        </ul>
                                    </div>
                                ))}
                            </section>

                            <section className="report-section">
                                <h2 className="section-title">■ Core Themes</h2>
                                {parsedReport.themes?.map((t, i) => (
                                    <div key={i} className="theme-item">
                                        <h4>#{t.theme}</h4>
                                        <ul className="report-list">
                                            {t.drivers?.map((d, di) => <li key={di}>{d.text}</li>)}
                                        </ul>
                                    </div>
                                ))}
                            </section>

                            <section className="report-section">
                                <h2 className="section-title">■ Implications</h2>
                                <div className="implications-grid">
                                    <div className="implication-box">
                                        <strong>[Market & Business]</strong>
                                        <ul>{parsedReport.implications?.market_business?.map((s, i) => <li key={i}>{s.text}</li>)}</ul>
                                    </div>
                                    <div className="implication-box">
                                        <strong>[Tech & Product]</strong>
                                        <ul>{parsedReport.implications?.tech_product?.map((s, i) => <li key={i}>{s.text}</li>)}</ul>
                                    </div>
                                    <div className="implication-box">
                                        <strong>[Competitive Landscape]</strong>
                                        <ul>{parsedReport.implications?.competitive_landscape?.map((s, i) => <li key={i}>{s.text}</li>)}</ul>
                                    </div>
                                    <div className="implication-box">
                                        <strong>[Policy & Regulation]</strong>
                                        <ul>{parsedReport.implications?.policy_regulation?.map((s, i) => <li key={i}>{s.text}</li>)}</ul>
                                    </div>
                                </div>
                            </section>

                            <section className="report-section">
                                <h2 className="section-title">■ Risks & Uncertainties</h2>
                                {parsedReport.risks_and_uncertainties?.map((r, i) => (
                                    <div key={i} className="risk-item">
                                        <strong>[{r.type}] {r.risk}</strong>
                                        <div className="evidence-badge" data-level={r.evidence_level}>Evidence: {r.evidence_level}</div>
                                        <ul className="report-list">
                                            {r.impact_paths?.map((p, pi) => <li key={pi}>{p.text}</li>)}
                                        </ul>
                                    </div>
                                ))}
                            </section>

                            <section className="report-section">
                                <h2 className="section-title">■ Watchlist</h2>
                                <div className="watchlist-grid">
                                    {parsedReport.watchlist?.map((w, i) => (
                                        <div key={i} className="watch-item">
                                            <div className="watch-signal">{w.signal}</div>
                                            <div className="watch-why">Why: {w.why}</div>
                                            <div className="watch-how">How: {w.how_to_monitor}</div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className="report-section">
                                <h2 className="section-title">■ Sources</h2>
                                <div className="source-chips">
                                    {parsedReport.sources?.map((src, i) => {
                                        const { url, title } = getSourceInfo(src);
                                        return (
                                            <a
                                                key={i}
                                                href={url}
                                                className="source-chip"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={`[${src.sid}] ${title} (${src.publisher})\n${url}`}
                                            >
                                                <span className="source-sid">{src.sid}</span>
                                                <span className="source-host">{formatUrl(url)}</span>
                                            </a>
                                        );
                                    })}
                                </div>
                            </section>

                            <section className="report-section quality-section">
                                <h2 className="section-title">■ Analysis Quality</h2>
                                {parsedReport.quality?.coverage_gaps?.length && parsedReport.quality.coverage_gaps.length > 0 ? (
                                    <div className="quality-item">
                                        <strong>Coverage Gaps:</strong>
                                        <ul>{parsedReport.quality.coverage_gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
                                    </div>
                                ) : null}
                                {parsedReport.quality?.conflicts?.length && parsedReport.quality.conflicts.length > 0 ? (
                                    <div className="quality-item">
                                        <strong>Conflicts:</strong>
                                        <ul>{parsedReport.quality.conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul>
                                    </div>
                                ) : null}
                            </section>
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
                    width: 95%; max-width: 900px; height: 90vh;
                    border-radius: 12px; display: flex; flex-direction: column;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                }
                .modal-header {
                    padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border-color);
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
                
                .report-content { color: var(--text-primary); }
                .report-meta-box { margin-bottom: 2rem; padding-bottom: 1.25rem; border-bottom: 2px solid var(--border-color); }
                .report-title { font-size: 1.6rem; font-weight: 800; margin-bottom: 1rem; line-height: 1.2; color: var(--text-primary); }
                .report-badge-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
                .badge { background: var(--bg-body); padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; color: var(--text-secondary); border: 1px solid var(--border-color); }
                
                .report-section { margin-bottom: 3rem; }
                .section-title { font-size: 1.2rem; font-weight: 800; margin-bottom: 1.25rem; color: var(--accent-color); border-left: 5px solid var(--accent-color); padding-left: 0.75rem; }
                
                .summary-group h4 { margin: 1.5rem 0 0.5rem 0; font-size: 1rem; color: var(--text-primary); }
                .report-list { list-style: none; padding: 0; margin: 0; }
                .report-list li { margin-bottom: 0.6rem; line-height: 1.6; position: relative; padding-left: 1.25rem; font-size: 0.95rem; }
                .report-list li::before { content: "•"; position: absolute; left: 0; color: var(--accent-color); }
                
                .development-item { margin-bottom: 2rem; padding: 1.25rem; background: var(--bg-body); border-radius: 8px; border: 1px solid var(--border-color); }
                .development-headline { font-size: 1.1rem; font-weight: 700; margin-bottom: 0.75rem; color: var(--text-primary); }
                .evidence-badge { display: inline-block; font-size: 0.75rem; font-weight: 700; padding: 0.1rem 0.4rem; border-radius: 4px; margin-bottom: 0.75rem; text-transform: uppercase; }
                .evidence-badge[data-level="high"] { background: #10b98122; color: #10b981; border: 1px solid #10b98144; }
                .evidence-badge[data-level="medium"] { background: #f59e0b22; color: #f59e0b; border: 1px solid #f59e0b44; }
                .evidence-badge[data-level="low"] { background: #ef444422; color: #ef4444; border: 1px solid #ef444444; }
                
                .analysis-basis { font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem; font-style: italic; }
                
                .theme-item { margin-bottom: 1.25rem; }
                .theme-item h4 { margin-bottom: 0.5rem; color: var(--accent-color); font-size: 1.05rem; }
                
                .implications-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
                .implication-box { background: var(--bg-body); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-color); }
                .implication-box strong { display: block; margin-bottom: 0.5rem; color: var(--text-primary); font-size: 0.9rem; }
                .implication-box ul { padding-left: 1.25rem; margin: 0; font-size: 0.9rem; }
                
                .risk-item { margin-bottom: 1.5rem; padding: 1rem; border-left: 3px solid #ef4444; background: #ef444408; }
                .risk-item strong { display: block; margin-bottom: 0.5rem; }
                
                .watchlist-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
                .watch-item { padding: 1rem; background: var(--bg-body); border-radius: 8px; border: 1px solid var(--border-color); }
                .watch-signal { font-weight: 700; margin-bottom: 0.5rem; color: var(--accent-color); }
                .watch-why, .watch-how { font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem; }
                
                .source-chips {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }
                .source-chip {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: var(--bg-body);
                    border: 1px solid var(--border-color);
                    padding: 4px 10px;
                    border-radius: 6px;
                    text-decoration: none;
                    font-size: 0.8rem;
                    color: var(--text-primary);
                    transition: all 0.2s;
                }
                .source-chip:hover {
                    background: var(--accent-light);
                    border-color: var(--accent-color);
                    transform: translateY(-1px);
                }
                .source-sid {
                    background: var(--accent-color);
                    color: white;
                    font-size: 0.7rem;
                    font-weight: 700;
                    padding: 1px 4px;
                    border-radius: 3px;
                }
                .source-host {
                    color: var(--accent-color);
                    font-weight: 500;
                }
                
                .quality-item { font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem; }

                .copy-toast {
                    position: fixed; left: 50%; top: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(0, 0, 0, 0.85); color: white;
                    padding: 0.8rem 1.6rem; border-radius: 9999px;
                    font-size: 0.95rem; font-weight: 600; z-index: 2000;
                    pointer-events: none;
                    animation: fadeInOut 2s ease-in-out forwards;
                    backdrop-filter: blur(8px);
                    box-shadow: 0 10px 25px rgba(0,0,0,0.4);
                }

                @keyframes fadeInOut {
                    0% { opacity: 0; transform: translate(-50%, -40%); }
                    10% { opacity: 1; transform: translate(-50%, -50%); }
                    90% { opacity: 1; transform: translate(-50%, -50%); }
                    100% { opacity: 0; transform: translate(-50%, -60%); }
                }

                @media (max-width: 640px) {
                    .implications-grid, .watchlist-grid { grid-template-columns: 1fr; }
                    .report-title { font-size: 1.4rem; }
                    .modal-body { padding: 1.25rem; }
                }
            `}</style>
        </div>
    );
}
