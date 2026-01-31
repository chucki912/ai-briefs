'use client';

import ReactMarkdown from 'react-markdown';

interface TrendReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    report: string;
    loading: boolean;
}

export default function TrendReportModal({ isOpen, onClose, report, loading }: TrendReportModalProps) {
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
                        <button
                            className="btn btn-secondary"
                            onClick={() => {
                                navigator.clipboard.writeText(report);
                                alert('리포트가 클립보드에 복사되었습니다.');
                            }}
                        >
                            📋 복사하기
                        </button>
                        <button className="btn" onClick={onClose}>닫기</button>
                    </div>
                )}
            </div>
            <style jsx>{`
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 1000;
                    padding: 1rem;
                }
                .modal-content.report-modal {
                    background: var(--bg-card);
                    width: 90%;
                    max-width: 800px;
                    height: 85vh;
                    border-radius: 12px;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                }
                .modal-header {
                    padding: 1.5rem;
                    border-bottom: 1px solid var(--border-color);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .modal-header h2 {
                    font-size: 1.25rem;
                    margin: 0;
                }
                .close-btn {
                    background: none;
                    border: none;
                    font-size: 2rem;
                    color: var(--text-secondary);
                    cursor: pointer;
                    padding: 0;
                    line-height: 1;
                }
                .modal-body {
                    flex: 1;
                    overflow-y: auto;
                    padding: 2rem;
                }
                .modal-footer {
                    padding: 1rem 1.5rem;
                    border-top: 1px solid var(--border-color);
                    display: flex;
                    justify-content: flex-end;
                    gap: 1rem;
                }
                .loading-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    gap: 1rem;
                    color: var(--text-secondary);
                }
                .loading-tip {
                    font-size: 0.9rem;
                    opacity: 0.8;
                }
                .markdown-content {
                    line-height: 1.7;
                    color: var(--text-primary);
                }
                /* Markdown Styles */
                .markdown-content h1, .markdown-content h2, .markdown-content h3 {
                    margin-top: 1.5em;
                    margin-bottom: 0.5em;
                    color: var(--text-primary);
                }
                .markdown-content p {
                    margin-bottom: 1em;
                }
                .markdown-content ul, .markdown-content ol {
                    padding-left: 1.5rem;
                    margin-bottom: 1em;
                }
                .markdown-content blockquote {
                    border-left: 4px solid var(--accent-color);
                    padding-left: 1rem;
                    margin: 1em 0;
                    color: var(--text-secondary);
                    font-style: italic;
                }
            `}</style>
        </div>
    );
}
