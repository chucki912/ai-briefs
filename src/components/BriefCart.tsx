
'use client';

import { useState } from 'react';
import { useBriefCart } from '@/contexts/BriefCartContext';
import TrendReportModal from './TrendReportModal';

export default function BriefCart() {
    const {
        items,
        removeFromCart,
        clearCart,
        manualUrls,
        addManualUrl,
        removeManualUrl,
        updateManualUrl,
        manualTexts,
        addManualText,
        removeManualText,
        updateManualText,
    } = useBriefCart();

    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'url' | 'text'>('url');

    // Trend Report State
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [reportContent, setReportContent] = useState('');
    const [reportLoading, setReportLoading] = useState(false);

    const handleGenerateReport = async () => {
        const validUrls = manualUrls.filter((url: string) => url.trim() !== '');
        const validTexts = manualTexts.filter((t: string) => t.trim() !== '');

        if (items.length === 0 && validUrls.length === 0 && validTexts.length === 0) {
            alert('리포트를 생성하려면 이슈를 담거나 소스를 추가하세요.');
            return;
        }

        setIsReportModalOpen(true);
        setReportLoading(true);
        setReportContent('');
        setIsOpen(false);

        try {
            const res = await fetch('/api/reports/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'CUSTOM',
                    selectionMethod: items.length > 0 ? 'MANUAL_SELECTION' : 'MANUAL_ONLY',
                    selectedIssues: items,
                    manualUrls: validUrls,
                    manualTexts: validTexts,
                })
            });

            if (!res.ok) throw new Error('Report generation failed');

            const data = await res.json();
            setReportContent(data.report);
        } catch (e) {
            console.error(e);
            alert('리포트 생성 실패');
            setIsReportModalOpen(false);
        } finally {
            setReportLoading(false);
        }
    };

    const hasContent = items.length > 0
        || manualUrls.some((u: string) => u.trim() !== '')
        || manualTexts.some((t: string) => t.trim() !== '');

    if (items.length === 0 && !isOpen) return null;

    return (
        <>
            {/* Floating Action Button */}
            {!isOpen && items.length > 0 && (
                <button className="cart-fab" onClick={() => setIsOpen(true)}>
                    <span className="cart-icon">🛒</span>
                    <span className="cart-count">{items.length}</span>
                </button>
            )}

            {/* Cart Drawer */}
            {isOpen && (
                <div className="cart-drawer-overlay" onClick={() => setIsOpen(false)}>
                    <div className="cart-drawer" onClick={e => e.stopPropagation()}>
                        <div className="cart-header">
                            <h3>📑 리포트 카트 ({items.length})</h3>
                            <button className="close-btn" onClick={() => setIsOpen(false)}>&times;</button>
                        </div>

                        <div className="cart-body">
                            {/* Selected Issues */}
                            <div className="cart-section">
                                <div className="section-header">
                                    <h4>🗂️ 선택된 이슈</h4>
                                    {items.length > 0 && (
                                        <button className="clear-btn" onClick={clearCart}>전체 비우기</button>
                                    )}
                                </div>

                                {items.length === 0 ? (
                                    <p className="empty-text">홈이나 아카이브에서 이슈를 담아주세요.</p>
                                ) : (
                                    <ul className="cart-items">
                                        {items.map((item) => (
                                            <li key={item.id} className="cart-item">
                                                <div className="item-meta">
                                                    <span className="item-date">{item.originalBriefDate}</span>
                                                    <button
                                                        className="remove-item-btn"
                                                        onClick={() => removeFromCart(item.headline)}
                                                    >
                                                        &times;
                                                    </button>
                                                </div>
                                                <div className="item-title">{item.headline}</div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            {/* Manual Sources — Tab Switcher */}
                            <div className="cart-section">
                                <h4>📎 추가 소스 (옵션)</h4>
                                <div className="source-tabs">
                                    <button
                                        className={`tab-btn ${activeTab === 'url' ? 'active' : ''}`}
                                        onClick={() => setActiveTab('url')}
                                    >
                                        🔗 URL 입력
                                    </button>
                                    <button
                                        className={`tab-btn ${activeTab === 'text' ? 'active' : ''}`}
                                        onClick={() => setActiveTab('text')}
                                    >
                                        📄 원문 붙여넣기
                                    </button>
                                </div>

                                {/* URL Tab */}
                                {activeTab === 'url' && (
                                    <div className="tab-content">
                                        <p className="input-guide">외부 기사 URL을 입력하면 크롤링하여 분석합니다.</p>
                                        {manualUrls.map((url: string, idx: number) => (
                                            <div key={idx} className="input-row">
                                                <input
                                                    type="text"
                                                    className="source-input"
                                                    placeholder="https://..."
                                                    value={url}
                                                    onChange={(e) => updateManualUrl(idx, e.target.value)}
                                                />
                                                {manualUrls.length > 1 && (
                                                    <button className="remove-btn" onClick={() => removeManualUrl(idx)}>✕</button>
                                                )}
                                            </div>
                                        ))}
                                        <button className="add-btn" onClick={() => addManualUrl('')}>+ URL 추가</button>
                                    </div>
                                )}

                                {/* Text Tab */}
                                {activeTab === 'text' && (
                                    <div className="tab-content">
                                        <p className="input-guide">크롤링이 안 되는 사이트는 기사 원문을 직접 붙여넣으세요.</p>
                                        {manualTexts.length === 0 ? (
                                            <button className="add-btn" onClick={addManualText}>+ 원문 텍스트 추가</button>
                                        ) : (
                                            <>
                                                {manualTexts.map((text: string, idx: number) => (
                                                    <div key={idx} className="text-block">
                                                        <div className="text-block-header">
                                                            <span className="text-label">원문 #{idx + 1}</span>
                                                            <button className="remove-btn" onClick={() => removeManualText(idx)}>✕</button>
                                                        </div>
                                                        <textarea
                                                            className="source-textarea"
                                                            placeholder="기사 원문 또는 리포트 내용을 여기에 붙여넣기..."
                                                            value={text}
                                                            onChange={(e) => updateManualText(idx, e.target.value)}
                                                            rows={6}
                                                        />
                                                        <span className="char-count">{text.length.toLocaleString()}자</span>
                                                    </div>
                                                ))}
                                                <button className="add-btn" onClick={addManualText}>+ 원문 텍스트 추가</button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="cart-footer">
                            <button
                                className="generate-btn"
                                onClick={handleGenerateReport}
                                disabled={!hasContent}
                            >
                                ✨ 통합 리포트 생성
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <TrendReportModal
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
                report={reportContent}
                loading={reportLoading}
                onGenerationComplete={() => setReportLoading(false)}
            />

            <style jsx>{`
                .cart-fab {
                    position: fixed;
                    bottom: 2rem;
                    right: 2rem;
                    background: linear-gradient(135deg, var(--accent-color), var(--accent-dark));
                    color: white;
                    border: none;
                    border-radius: 99px;
                    padding: 1rem 1.5rem;
                    box-shadow: 0 4px 16px rgba(79, 70, 229, 0.4);
                    cursor: pointer;
                    z-index: 999;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-weight: 700;
                    font-size: 1rem;
                    transition: all 0.2s;
                }
                .cart-fab:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 8px 24px rgba(79, 70, 229, 0.5);
                }
                .cart-count {
                    background: white;
                    color: var(--accent-color);
                    border-radius: 50%;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.8rem;
                    font-weight: 800;
                }

                .cart-drawer-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.5);
                    backdrop-filter: blur(4px);
                    z-index: 1000;
                    display: flex;
                    justify-content: flex-end;
                }

                .cart-drawer {
                    width: 100%;
                    max-width: 420px;
                    background: var(--bg-card);
                    height: 100%;
                    box-shadow: -4px 0 24px rgba(0,0,0,0.2);
                    display: flex;
                    flex-direction: column;
                    animation: slideIn 0.3s ease-out;
                }

                @keyframes slideIn {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }

                .cart-header {
                    padding: 1.25rem 1.5rem;
                    border-bottom: 1px solid var(--border-color);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: var(--bg-card);
                }
                .cart-header h3 { margin: 0; font-size: 1.15rem; }
                .close-btn { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-secondary); padding: 0; line-height: 1; }

                .cart-body {
                    flex: 1;
                    overflow-y: auto;
                    padding: 1.25rem 1.5rem;
                }

                .cart-section { margin-bottom: 1.5rem; }
                .cart-section > h4 {
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    margin: 0 0 0.75rem 0;
                }
                .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
                .section-header h4 {
                    margin: 0;
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .clear-btn {
                    font-size: 0.75rem;
                    color: #ef4444;
                    background: rgba(239,68,68,0.1);
                    border: none;
                    border-radius: 6px;
                    padding: 4px 10px;
                    cursor: pointer;
                    font-weight: 600;
                }

                .empty-text {
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                    text-align: center;
                    padding: 1.5rem;
                    background: var(--bg-body);
                    border-radius: 10px;
                    border: 1px dashed var(--border-color);
                }

                .cart-items { list-style: none; padding: 0; margin: 0; }
                .cart-item {
                    background: var(--bg-body);
                    border: 1px solid var(--border-color);
                    border-radius: 10px;
                    padding: 0.85rem 1rem;
                    margin-bottom: 0.5rem;
                    transition: border-color 0.15s;
                }
                .cart-item:hover { border-color: var(--accent-color); }
                .item-meta { display: flex; justify-content: space-between; margin-bottom: 0.4rem; }
                .item-date { font-size: 0.75rem; color: var(--accent-color); font-weight: 600; }
                .remove-item-btn { background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 1.1rem; line-height: 1; padding: 0; opacity: 0.5; transition: opacity 0.15s; }
                .remove-item-btn:hover { opacity: 1; color: #ef4444; }
                .item-title { font-size: 0.9rem; font-weight: 600; line-height: 1.4; }

                /* Tab Switcher */
                .source-tabs {
                    display: flex;
                    gap: 4px;
                    margin-bottom: 0.75rem;
                    background: var(--bg-body);
                    border-radius: 10px;
                    padding: 4px;
                }
                .tab-btn {
                    flex: 1;
                    padding: 8px 12px;
                    border: none;
                    border-radius: 8px;
                    background: transparent;
                    color: var(--text-secondary);
                    font-size: 0.8rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .tab-btn.active {
                    background: var(--accent-color);
                    color: white;
                    box-shadow: 0 2px 8px rgba(79, 70, 229, 0.3);
                }

                .tab-content {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                .input-guide {
                    font-size: 0.78rem;
                    color: var(--text-secondary);
                    margin: 0;
                    line-height: 1.4;
                }

                .input-row { display: flex; gap: 6px; }
                .source-input {
                    flex: 1;
                    padding: 10px 12px;
                    border-radius: 8px;
                    border: 1px solid var(--border-color);
                    background: var(--bg-body);
                    color: var(--text-primary);
                    font-size: 0.85rem;
                    transition: border-color 0.15s;
                }
                .source-input:focus {
                    outline: none;
                    border-color: var(--accent-color);
                    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
                }

                .text-block {
                    background: var(--bg-body);
                    border: 1px solid var(--border-color);
                    border-radius: 10px;
                    padding: 0.75rem;
                    margin-bottom: 0.25rem;
                }
                .text-block-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.5rem;
                }
                .text-label {
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: var(--accent-color);
                }
                .source-textarea {
                    width: 100%;
                    padding: 10px 12px;
                    border-radius: 8px;
                    border: 1px solid var(--border-color);
                    background: var(--bg-card);
                    color: var(--text-primary);
                    font-size: 0.82rem;
                    line-height: 1.5;
                    resize: vertical;
                    font-family: inherit;
                    min-height: 100px;
                    transition: border-color 0.15s;
                    box-sizing: border-box;
                }
                .source-textarea:focus {
                    outline: none;
                    border-color: var(--accent-color);
                    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
                }
                .char-count {
                    font-size: 0.7rem;
                    color: var(--text-secondary);
                    text-align: right;
                    display: block;
                    margin-top: 4px;
                }

                .remove-btn {
                    background: none;
                    border: 1px solid var(--border-color);
                    border-radius: 6px;
                    color: var(--text-secondary);
                    cursor: pointer;
                    width: 32px;
                    height: 32px;
                    font-size: 0.75rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    transition: all 0.15s;
                }
                .remove-btn:hover { border-color: #ef4444; color: #ef4444; }

                .add-btn {
                    font-size: 0.82rem;
                    color: var(--accent-color);
                    background: transparent;
                    border: 1px dashed var(--accent-color);
                    padding: 8px 12px;
                    border-radius: 8px;
                    cursor: pointer;
                    width: 100%;
                    transition: all 0.15s;
                    font-weight: 600;
                    margin-top: 4px;
                }
                .add-btn:hover {
                    background: rgba(79, 70, 229, 0.05);
                }

                .cart-footer {
                    padding: 1.25rem 1.5rem;
                    border-top: 1px solid var(--border-color);
                    background: var(--bg-card);
                }
                .generate-btn {
                    width: 100%;
                    background: linear-gradient(135deg, var(--accent-color), var(--accent-dark));
                    color: white;
                    border: none;
                    padding: 0.9rem;
                    border-radius: 12px;
                    font-size: 1rem;
                    font-weight: 700;
                    cursor: pointer;
                    box-shadow: 0 4px 16px rgba(79, 70, 229, 0.3);
                    transition: all 0.2s;
                }
                .generate-btn:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
                }
                .generate-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    box-shadow: none;
                }
            `}</style>
        </>
    );
}
