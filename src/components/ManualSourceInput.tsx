
'use client';

import { useState } from 'react';

interface ManualSourceInputProps {
    manualUrls: string[];
    setManualUrls: (urls: string[]) => void;
    manualTexts: string[];
    setManualTexts: (texts: string[]) => void;
}

export default function ManualSourceInput({
    manualUrls,
    setManualUrls,
    manualTexts,
    setManualTexts,
}: ManualSourceInputProps) {
    const [showInput, setShowInput] = useState(false);
    const [activeTab, setActiveTab] = useState<'url' | 'text'>('url');

    const addUrl = () => setManualUrls([...manualUrls, '']);
    const updateUrl = (idx: number, value: string) => {
        const newUrls = [...manualUrls];
        newUrls[idx] = value;
        setManualUrls(newUrls);
    };
    const removeUrl = (idx: number) => setManualUrls(manualUrls.filter((_, i) => i !== idx));

    const addText = () => setManualTexts([...manualTexts, '']);
    const updateText = (idx: number, value: string) => {
        const newTexts = [...manualTexts];
        newTexts[idx] = value;
        setManualTexts(newTexts);
    };
    const removeText = (idx: number) => setManualTexts(manualTexts.filter((_, i) => i !== idx));

    return (
        <div className="msi-wrapper">
            <button className="msi-toggle" onClick={() => setShowInput(!showInput)}>
                {showInput ? '▼ 추가 소스 입력 숨기기' : '▶ 추가 소스 입력 (옵션)'}
            </button>

            {showInput && (
                <div className="msi-content">
                    {/* Tab Switcher */}
                    <div className="msi-tabs">
                        <button
                            className={`msi-tab ${activeTab === 'url' ? 'active' : ''}`}
                            onClick={() => setActiveTab('url')}
                        >
                            🔗 URL 입력
                        </button>
                        <button
                            className={`msi-tab ${activeTab === 'text' ? 'active' : ''}`}
                            onClick={() => setActiveTab('text')}
                        >
                            📄 원문 붙여넣기
                        </button>
                    </div>

                    {/* URL Tab */}
                    {activeTab === 'url' && (
                        <div className="msi-panel">
                            <p className="msi-guide">외부 기사 URL을 입력하면 크롤링하여 분석합니다.</p>
                            {manualUrls.map((url, idx) => (
                                <div key={idx} className="msi-input-row">
                                    <input
                                        type="text"
                                        className="msi-url-input"
                                        placeholder="https://..."
                                        value={url}
                                        onChange={(e) => updateUrl(idx, e.target.value)}
                                    />
                                    {manualUrls.length > 1 && (
                                        <button className="msi-remove-btn" onClick={() => removeUrl(idx)}>✕</button>
                                    )}
                                </div>
                            ))}
                            <button className="msi-add-btn" onClick={addUrl}>+ URL 추가</button>
                        </div>
                    )}

                    {/* Text Tab */}
                    {activeTab === 'text' && (
                        <div className="msi-panel">
                            <p className="msi-guide">크롤링이 안 되는 사이트는 기사 원문을 직접 붙여넣으세요.</p>
                            {manualTexts.length === 0 ? (
                                <button className="msi-add-btn" onClick={addText}>+ 원문 텍스트 추가</button>
                            ) : (
                                <>
                                    {manualTexts.map((text, idx) => (
                                        <div key={idx} className="msi-text-block">
                                            <div className="msi-text-header">
                                                <span className="msi-text-label">원문 #{idx + 1}</span>
                                                <button className="msi-remove-btn" onClick={() => removeText(idx)}>✕</button>
                                            </div>
                                            <textarea
                                                className="msi-textarea"
                                                placeholder="기사 원문 또는 리포트 내용을 여기에 붙여넣기..."
                                                value={text}
                                                onChange={(e) => updateText(idx, e.target.value)}
                                                rows={6}
                                            />
                                            <span className="msi-char-count">{text.length.toLocaleString()}자</span>
                                        </div>
                                    ))}
                                    <button className="msi-add-btn" onClick={addText}>+ 원문 텍스트 추가</button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            <style jsx>{`
                .msi-wrapper {
                    margin-bottom: 1.5rem;
                    background: var(--bg-secondary, #f5f5f7);
                    padding: 1rem 1.25rem;
                    border-radius: 14px;
                    border: 1px solid var(--border-color, #e5e7eb);
                }

                .msi-toggle {
                    background: none;
                    border: none;
                    color: var(--text-secondary, #6b7280);
                    cursor: pointer;
                    font-size: 0.88rem;
                    font-weight: 600;
                    padding: 0;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .msi-toggle:hover { color: var(--text-primary, #111); }

                .msi-content {
                    margin-top: 1rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }

                .msi-tabs {
                    display: flex;
                    gap: 4px;
                    background: var(--bg-body, #fff);
                    border-radius: 10px;
                    padding: 4px;
                }

                .msi-tab {
                    flex: 1;
                    padding: 9px 14px;
                    border: none;
                    border-radius: 8px;
                    background: transparent;
                    color: var(--text-secondary, #6b7280);
                    font-size: 0.82rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .msi-tab:hover {
                    color: var(--text-primary, #111);
                    background: rgba(79, 70, 229, 0.04);
                }
                .msi-tab.active {
                    background: var(--accent-color, #4f46e5);
                    color: white;
                    box-shadow: 0 2px 8px rgba(79, 70, 229, 0.3);
                }

                .msi-panel {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }

                .msi-guide {
                    font-size: 0.8rem;
                    color: var(--text-secondary, #6b7280);
                    margin: 0;
                    line-height: 1.4;
                }

                .msi-input-row {
                    display: flex;
                    gap: 6px;
                }
                .msi-url-input {
                    flex: 1;
                    padding: 10px 14px;
                    border-radius: 10px;
                    border: 1px solid var(--border-color, #e5e7eb);
                    background: var(--bg-body, #fff);
                    color: var(--text-primary, #111);
                    font-size: 0.85rem;
                    transition: border-color 0.15s;
                }
                .msi-url-input:focus {
                    outline: none;
                    border-color: var(--accent-color, #4f46e5);
                    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
                }

                .msi-text-block {
                    background: var(--bg-body, #fff);
                    border: 1px solid var(--border-color, #e5e7eb);
                    border-radius: 12px;
                    padding: 0.85rem;
                }
                .msi-text-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.5rem;
                }
                .msi-text-label {
                    font-size: 0.78rem;
                    font-weight: 700;
                    color: var(--accent-color, #4f46e5);
                }
                .msi-textarea {
                    width: 100%;
                    padding: 10px 14px;
                    border-radius: 10px;
                    border: 1px solid var(--border-color, #e5e7eb);
                    background: var(--bg-card, #f9fafb);
                    color: var(--text-primary, #111);
                    font-size: 0.84rem;
                    line-height: 1.6;
                    resize: vertical;
                    font-family: inherit;
                    min-height: 120px;
                    box-sizing: border-box;
                    transition: border-color 0.15s;
                }
                .msi-textarea:focus {
                    outline: none;
                    border-color: var(--accent-color, #4f46e5);
                    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
                }
                .msi-char-count {
                    font-size: 0.72rem;
                    color: var(--text-secondary, #6b7280);
                    text-align: right;
                    display: block;
                    margin-top: 4px;
                }

                .msi-remove-btn {
                    background: var(--bg-body, #fff);
                    border: 1px solid var(--border-color, #e5e7eb);
                    border-radius: 8px;
                    color: var(--text-secondary, #6b7280);
                    cursor: pointer;
                    width: 34px;
                    height: 34px;
                    font-size: 0.78rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    transition: all 0.15s;
                }
                .msi-remove-btn:hover {
                    border-color: #ef4444;
                    color: #ef4444;
                    background: rgba(239, 68, 68, 0.05);
                }

                .msi-add-btn {
                    font-size: 0.84rem;
                    color: var(--accent-color, #4f46e5);
                    background: transparent;
                    border: 1px dashed var(--accent-color, #4f46e5);
                    padding: 10px 14px;
                    border-radius: 10px;
                    cursor: pointer;
                    width: 100%;
                    font-weight: 600;
                    transition: all 0.15s;
                }
                .msi-add-btn:hover {
                    background: rgba(79, 70, 229, 0.05);
                    border-style: solid;
                }
            `}</style>
        </div>
    );
}
