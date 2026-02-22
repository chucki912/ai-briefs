'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { IssueItem } from '@/types';
import { logger } from '@/lib/logger';

interface TrendReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    report: string;
    loading: boolean;
    issue?: IssueItem;
    onRetry?: () => void;
    onGenerationComplete?: () => void;
    trendReportApiUrl?: string; // 배터리 등 다른 산업용 API URL 지원
    weeklyMode?: boolean; // 주간 리포트 모드
    weeklyDomain?: 'ai' | 'battery'; // 주간 리포트 도메인
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

export default function TrendReportModal({ isOpen, onClose, report, loading, issue, onRetry, onGenerationComplete, trendReportApiUrl = '/api/trend-report', weeklyMode = false, weeklyDomain = 'ai' }: TrendReportModalProps) {
    const [parsedReport, setParsedReport] = useState<TrendReportData | null>(null);
    const [localReport, setLocalReport] = useState<string>('');
    const [parseError, setParseError] = useState(false);
    const [showCopyToast, setShowCopyToast] = useState(false);

    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const [loadingStep, setLoadingStep] = useState(0); // 0: Start, 1: Collecting, 2: Clustering, 3: Generating
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    useEffect(() => {
        // 클린업 함수 정의
        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
        };
    }, []);

    const [statusMessage, setStatusMessage] = useState<string>('심층 분석 및 리포트 작성 중... (최대 3분 소요)');

    useEffect(() => {
        if (!loading && report && !issue && !weeklyMode) {
            processReport(report);
        } else if (isOpen && loading && issue && !weeklyMode) {
            // Single Issue Deep Dive mode
            const fetchTrendReport = async () => {
                setIsPolling(true);
                setStatusMessage('심층 분석 및 리포트 작성 중... (최대 3분 소요)');
                try {
                    const startRes = await fetch(trendReportApiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ issue })
                    });

                    if (!startRes.ok) throw new Error('Failed to start report generation');
                    const { data: { jobId } } = await startRes.json();

                    pollIntervalRef.current = setInterval(async () => {
                        try {
                            const statusRes = await fetch(`${trendReportApiUrl}/status?jobId=${jobId}`);
                            if (!statusRes.ok) return;

                            const { data: statusData } = await statusRes.json();

                            if (statusData.status === 'completed') {
                                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                                processReport(statusData.report);
                                setIsPolling(false);
                                onGenerationComplete?.();
                            } else if (statusData.status === 'failed') {
                                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                                setParseError(true);
                                alert('리포트 생성 실패: ' + (statusData.error || '알 수 없는 오류'));
                                setIsPolling(false);
                                onGenerationComplete?.();
                                onClose();
                            }
                        } catch (e) {
                            console.error('Polling error', e);
                        }
                    }, 2000);

                } catch (e) {
                    console.error('Error starting trend report', e);
                    setParseError(true);
                    setIsPolling(false);
                    onGenerationComplete?.();
                    onClose();
                }
            };

            fetchTrendReport();
        } else if (isOpen && loading && weeklyMode) {
            // Weekly Report mode
            const fetchWeeklyReport = async () => {
                setLoadingStep(0);
                setIsPolling(true);
                setStatusMessage('최근 7일 이슈를 수집 중...');
                try {
                    const startRes = await fetch('/api/weekly-report', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ domain: weeklyDomain })
                    });

                    if (!startRes.ok) throw new Error('Failed to start weekly report generation');
                    const { data: { jobId } } = await startRes.json();

                    pollIntervalRef.current = setInterval(async () => {
                        try {
                            const statusRes = await fetch(`/api/weekly-report/status?jobId=${jobId}`);
                            if (!statusRes.ok) return;

                            const { data: statusData } = await statusRes.json();

                            // Update status message based on progress
                            if (statusData.status === 'collecting') {
                                setLoadingStep(1);
                                setStatusMessage('최근 7일 이슈를 수집 중...');
                            } else if (statusData.status === 'clustering') {
                                setLoadingStep(2);
                                setStatusMessage(statusData.message || '이슈를 주제별로 분류 중...');
                            } else if (statusData.status === 'generating') {
                                setLoadingStep(3);
                                setStatusMessage(statusData.message || '종합 심층 리포트 작성 중... (최대 3분 소요)');
                            } else if (statusData.status === 'completed') {
                                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                                processReport(statusData.report);
                                setLoadingStep(4);
                                setIsPolling(false);
                                onGenerationComplete?.();
                            } else if (statusData.status === 'failed') {
                                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                                setParseError(true);
                                setLocalReport(`## 🚨 리포트 생성 실패\n\n${statusData.error || '알 수 없는 오류가 발생했습니다.'}`);
                                setIsPolling(false);
                                onGenerationComplete?.();
                            }
                        } catch (e) {
                            console.error('Weekly polling error', e);
                        }
                    }, 3000); // 3초 간격 — 주간 리포트는 더 오래 걸림

                } catch (e: any) {
                    console.error('Error starting weekly report', e);
                    setParseError(true);
                    setLocalReport(`## 🚨 리포트 요청 실패\n\n${e.message || '알 수 없는 오류가 발생했습니다.'}`);
                    setIsPolling(false);
                    onGenerationComplete?.();
                }
            };

            fetchWeeklyReport();
        }
    }, [isOpen, loading, issue, report, weeklyMode]);

    useEffect(() => {
        if (isOpen && parsedReport && issue) {
            logger.viewReport(issue.headline);
        }
    }, [isOpen, parsedReport, issue]);

    // 레거시 JSON 파싱 시도 + 실패 시 Markdown 구조 파싱 (Hybrid Helper)
    const processReport = (inputStr: string) => {
        setLocalReport(inputStr); // Fallback storage



        // 1. Try standard JSON parse
        try {
            let cleanJson = inputStr.trim();
            cleanJson = cleanJson.replace(/```json\n?|```/g, '').trim();
            const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                let finalJson = jsonMatch[0].replace(/,\s*([\}\]])/g, '$1');
                const parsed = JSON.parse(finalJson);
                setParsedReport(parsed);
                setParseError(false);
                return;
            }
        } catch (e) {
            // JSON parsing failed, proceed to Markdown parsing
        }

        // 2. Fallback: Parse Markdown Structure to TrendReportData
        try {
            const parsedData = parseMarkdownToStructure(inputStr);
            if (parsedData) {
                setParsedReport(parsedData);
                setParseError(false);
            } else {
                throw new Error('Failed to parse Markdown structure');
            }
        } catch (e) {
            console.warn('Final parsing failed:', e);
            setParsedReport(null);
            setParseError(true);
        }
    };



    // Markdown 텍스트를 구조화된 데이터로 변환하는 파서
    const parseMarkdownToStructure = (md: string): TrendReportData | null => {
        try {
            const data: any = {
                report_meta: {},
                executive_summary: { signal_summary: [], what_changed: [], so_what: [] },
                key_developments: [],
                themes: [],
                implications: { market_business: [], tech_product: [], competitive_landscape: [], policy_regulation: [] },
                risks_and_uncertainties: [],
                watchlist: [],
                sources: [],
                quality: {}
            };

            // 1. Meta Extraction - Flexible matching for titles
            const titleMatch = md.match(/#\s*(?:\[트렌드 리포트\]|브리프 심층 리포트|\[Deep Dive\]|\[주간 전략 리포트\]|\[주간 트렌드 리포트\])?\s*:?\s*(.*)/i);
            if (titleMatch) data.report_meta.title = titleMatch[1].trim();

            // Fallback meta extraction if title regex is tricky
            if (!data.report_meta.title) {
                const firstLine = md.split('\n')[0].replace(/^#+\s*/, '').replace(/\[.*?\]/g, '').replace(/^:\s*/, '').trim();
                data.report_meta.title = firstLine || 'Strategic Intelligence Report';
            }

            const metaSection = md.split('■')[0]; // Everything before the first symbol
            const coverage = metaSection.match(/분석대상:\s*(.*)/);
            const audience = metaSection.match(/타겟:\s*(.*)/);
            const timeWindow = metaSection.match(/기간:\s*(.*)/);
            const lens = metaSection.match(/관점:\s*(.*)/);

            if (coverage) data.report_meta.coverage = coverage[1].trim();
            if (audience) data.report_meta.audience = audience[1].trim();
            if (timeWindow) data.report_meta.time_window = timeWindow[1].trim();
            if (lens) data.report_meta.lens = lens[1].trim();
            data.report_meta.generated_at = new Date().toISOString();

            // 2. Sections Splitting - Support various symbols (■, ●, ◆, ★, 🔹) and header levels
            const sections = md.split(/(?=##?\s*[■●◆★🔹]|(?<=\n)[■●◆★🔹])/);

            sections.forEach(section => {
                const cleanSection = section.replace(/##?\s*[■●◆★🔹]/, '').trim();

                // Executive Summary
                if (cleanSection.includes('Executive Summary')) {
                    const lines = cleanSection.split('\n');
                    lines.forEach(line => {
                        const cleanLine = line.replace(/\*\*/g, '').trim();
                        // Weekly Edition labels (check first — longer match takes priority)
                        if (cleanLine.includes('Top Strategic Signal]')) {
                            data.executive_summary.signal_summary.push({ text: cleanLine.replace(/.*Top Strategic Signal\]\s*/, '').replace(/^-\s*/, '').trim(), citations: [] });
                        } else if (cleanLine.includes('Signal]')) {
                            data.executive_summary.signal_summary.push({ text: cleanLine.replace(/.*Signal\]\s*/, '').replace(/^-\s*/, '').trim(), citations: [] });
                        }

                        if (cleanLine.includes('Converged Mega Trend]')) {
                            data.executive_summary.what_changed.push({ text: cleanLine.replace(/.*Converged Mega Trend\]\s*/, '').replace(/^-\s*/, '').trim(), citations: [] });
                        } else if (cleanLine.includes('Change]')) {
                            data.executive_summary.what_changed.push({ text: cleanLine.replace(/.*Change\]\s*/, '').replace(/^-\s*/, '').trim(), citations: [] });
                        }

                        if (cleanLine.includes('Strategic Recommendation]')) {
                            data.executive_summary.so_what.push({ text: cleanLine.replace(/.*Strategic Recommendation\]\s*/, '').replace(/^-\s*/, '').trim(), citations: [] });
                        } else if (cleanLine.includes('So What]')) {
                            data.executive_summary.so_what.push({ text: cleanLine.replace(/.*So What\]\s*/, '').replace(/^-\s*/, '').trim(), citations: [] });
                        }
                    });
                }

                // Key Developments (including Cluster Analysis)
                if (cleanSection.includes('Key Developments') || cleanSection.includes('Strategic Analysis') || cleanSection.includes('Cluster Analysis')) {
                    const devBlocks = cleanSection.split('###');
                    devBlocks.shift();
                    devBlocks.forEach(block => {
                        const lines = block.trim().split('\n');
                        const headline = lines[0].replace(/\[|\]/g, '').trim();
                        const facts: any[] = [];
                        const analysis: any[] = [];

                        const why_it_matters: any[] = [];

                        lines.slice(1).forEach(line => {
                            const cleanLine = line.replace(/\*\*/g, '').trim();

                            // Flexible regex for tags: [Fact], (Fact), Fact:, [Analysis], [Structural Linkage], etc.
                            const factMatch = cleanLine.match(/^(?:-\s*)?[\(\[]?Fact[\)\]:]?\s*(.*)/i);
                            const analysisMatch = cleanLine.match(/^(?:-\s*)?[\(\[]?(?:Strategic\s+)?Analysis[\)\]:]?\s*(.*)/i);
                            const linkageMatch = cleanLine.match(/^(?:-\s*)?[\(\[]?(?:Structural\s+)?Linkage[\)\]:]?|[\(\[]?Why[\)\]:]?\s*(.*)/i);

                            if (factMatch) {
                                facts.push({ text: factMatch[1].trim() });
                            } else if (analysisMatch) {
                                const analysisText = analysisMatch[1].trim();
                                const parts = analysisText.split(/Basis:/i);
                                const text = parts[0].replace(/\(\s*$/, '').trim();
                                let basis = parts[1] ? parts[1].replace(/\).*$/, '').trim() : '구조적 분석 기반';
                                analysis.push({ text, basis });
                            } else if (linkageMatch) {
                                // For linkage, prioritize text after the tag, fallback to cleanLine if match is empty
                                const linkageText = linkageMatch[1] ? linkageMatch[1].trim() : cleanLine.replace(/.*Linkage\]|.*Why\]\s*/i, '').replace(/^-\s*/, '').trim();
                                if (linkageText) why_it_matters.push({ text: linkageText });
                            }
                        });

                        if (headline) {
                            data.key_developments.push({
                                headline,
                                facts,
                                analysis,
                                why_it_matters,
                                evidence_level: 'high' // Default default
                            });
                        }
                    });
                }

                // Core Themes (including Economic Insights, Cost & Technology Dynamics)
                if (cleanSection.includes('Core Themes') || cleanSection.includes('Economic Insights') || cleanSection.includes('Cost') || cleanSection.includes('Technology Dynamics')) {
                    const themeBlocks = cleanSection.split('###');
                    themeBlocks.shift();
                    themeBlocks.forEach(block => {
                        const lines = block.trim().split('\n');
                        const themeName = lines[0].replace(/\[|\]/g, '').trim();
                        const drivers: any[] = [];

                        lines.slice(1).forEach(line => {
                            const cleanLine = line.replace(/\*\*/g, '').trim();
                            const driverMatch = cleanLine.match(/[\(\[]?(?:Primary\s+)?Driver[\)\]:]?|[\(\[]?Ripple\s+Effects[\)\]:]?|[\(\[]?Context[\)\]:]?|[\(\[]?Cost\/Efficiency\s+Logic[\)\]:]?|[\(\[]?Competitive\s+Position[\)\]:]?/i);
                            if (driverMatch) {
                                drivers.push({ text: cleanLine.replace(/[\(\[]?(?:Primary\s+)?Driver[\)\]:]?|[\(\[]?Ripple\s+Effects[\)\]:]?|[\(\[]?Context[\)\]:]?|[\(\[]?Cost\/Efficiency\s+Logic[\)\]:]?|[\(\[]?Competitive\s+Position[\)\]:]?/gi, '').replace(/^[-\s]*/, '').trim() });
                            }
                        });

                        if (themeName) {
                            data.themes.push({ theme: themeName, drivers });
                        }
                    });
                }

                // Implications (Strategic & Professional)
                if (cleanSection.includes('Implications')) {
                    const lines = cleanSection.split('\n');
                    lines.forEach(line => {
                        const cleanLine = line.replace(/\*\*/g, '').trim();

                        // Flexible regex for implications tags
                        const marketMatch = cleanLine.match(/[\(\[]?(?:Market|Market\s*&\s*CapEx|Market\s*&\s*Business)[\)\]:]?\s*(.*)/i);
                        const techMatch = cleanLine.match(/[\(\[]?(?:Tech|Technology\s*Frontier|Tech\s*&\s*Product)[\)\]:]?\s*(.*)/i);
                        const compMatch = cleanLine.match(/[\(\[]?(?:Comp|Competitive\s*Edge|Competitive\s*Landscape|Competitive\s*Position)[\)\]:]?\s*(.*)/i);
                        const policyMatch = cleanLine.match(/[\(\[]?(?:Policy|Regulation|Policy\s*&\s*Regulation)[\)\]:]?\s*(.*)/i);

                        if (marketMatch && marketMatch[1]) data.implications.market_business.push({ text: marketMatch[1].replace(/^-/, '').trim() });
                        else if (techMatch && techMatch[1]) data.implications.tech_product.push({ text: techMatch[1].replace(/^-/, '').trim() });
                        else if (compMatch && compMatch[1]) data.implications.competitive_landscape.push({ text: compMatch[1].replace(/^-/, '').trim() });
                        else if (policyMatch && policyMatch[1]) data.implications.policy_regulation.push({ text: policyMatch[1].replace(/^-/, '').trim() });
                    });
                }

                // Risks & Uncertainties (🔧 FIX: Hierarchical Parser for Impacts)
                if (cleanSection.includes('Risks') || cleanSection.includes('Uncertainties')) {
                    const lines = cleanSection.split('\n');
                    let currentRisk: any = null;

                    lines.forEach(line => {
                        const cleanLine = line.replace(/\*\*/g, '').trim();
                        if (!cleanLine) return;

                        // Identify new risk category line
                        const riskMatch = cleanLine.match(/^[-\s]*[\(\[]?(TECH|MARKET|REG|REGULATION|POLICY|SURVIVAL|SURVIVAL\s+RISK|MARKET\s+RISK)[\)\]:]?\s*(.*)/i);

                        // Identify impact line
                        const impactMatch = cleanLine.match(/^[-\s]*(?:Impact(?:\s*&\s*Mitigation)?|Mitigation)[:]?\s*(.*)/i);

                        if (riskMatch) {
                            // Start a new risk block
                            let type = riskMatch[1].toLowerCase().replace(' risk', '').replace('regulation', 'reg').replace('policy', 'reg');
                            let risk = riskMatch[2].trim();

                            currentRisk = {
                                type,
                                risk,
                                evidence_level: 'medium',
                                impact_paths: []
                            };
                            data.risks_and_uncertainties.push(currentRisk);
                        } else if (impactMatch && currentRisk) {
                            // Add impact to the current risk block
                            const impactText = impactMatch[1] ? impactMatch[1].trim() : cleanLine.replace(/.*Impact(?:\s*&\s*Mitigation)?[:]?\s*/i, '').replace(/^-\s*/, '').trim();
                            if (impactText) {
                                currentRisk.impact_paths.push({ text: impactText });
                            }
                        } else if (currentRisk && cleanLine.startsWith('-') && !riskMatch) {
                            // Handle case where it's a sub-item but doesn't have "Impact" label or is just detail
                            const detailText = cleanLine.replace(/^-\s*/, '').trim();
                            if (detailText && !detailText.toLowerCase().includes('fact]') && !detailText.toLowerCase().includes('analysis]')) {
                                currentRisk.impact_paths.push({ text: detailText });
                            }
                        }
                    });
                }

                // Watchlist Parser (Enhanced for Why/How/Threshold extraction)
                if (cleanSection.includes('Watchlist')) {
                    const blocks = cleanSection.split(/\r?\n(?=-)/);
                    blocks.forEach(block => {
                        const cleanBlock = block.replace(/Watchlist/i, '').trim();
                        if (!cleanBlock || !cleanBlock.startsWith('-')) return;

                        // 1. Extract Signal
                        const firstLine = cleanBlock.split('\n')[0];
                        const signalMatch = firstLine.match(/-\s*(?:\*\*)?(.*?)(?:\*\*)?(?::|\s*$)/);
                        let signalText = signalMatch ? signalMatch[1].replace(/<|>|\[|\]/g, '').trim() : '';

                        // 2. Extract Why
                        const whyMatch = cleanBlock.match(/\(Why\)\s*([^\n]+)/i);
                        let whyText = whyMatch ? whyMatch[1].trim() : '';

                        // Fallback: If (Why) is missing but there's text after a colon on the first line
                        if (!whyText && firstLine.includes(':')) {
                            whyText = firstLine.split(':')[1].trim();
                        }

                        // 3. Extract How/Threshold
                        const howMatch = cleanBlock.match(/\((?:How|Threshold)\)\s*([^\n]+)/i);
                        const howText = howMatch ? howMatch[1].trim() : '';

                        if (signalText && signalText.length > 1) {
                            data.watchlist.push({
                                signal: signalText,
                                why: whyText,
                                how_to_monitor: howText
                            });
                        }
                    });
                }

                // Sources (🔧 FIX #1: 접근 불가 출처 자동 필터링)
                if (cleanSection.startsWith('Sources')) {
                    const BLOCKED_DOMAINS = [
                        'vertexaisearch.cloud.google.com',
                        'google.com/search',
                        'bing.com/search',
                        'search.yahoo.com'
                    ];

                    const lines = cleanSection.split('\n');
                    lines.forEach((line, idx) => {
                        // Format: - [1] Title | Date | [Label] URL   OR   - [1] Title | Date | URL
                        // Flexible Regex to capture 4 parts: ID, Title, Date, and the rest (URL + Label)
                        const match = line.match(/^\-\s*\[(\d+)\]\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.*)/);

                        if (match) {
                            let urlPart = match[4].trim();

                            // Remove label if present (e.g. [Brief Origin]) to extract pure URL
                            let url = urlPart.replace(/^\[.*?\]\s*/, '').trim();

                            // Check if URL is from a blocked domain
                            const isBlocked = BLOCKED_DOMAINS.some(domain => url.includes(domain));
                            if (!isBlocked) {
                                let title = match[2].trim();
                                let publisher = 'Source';

                                // Extract publisher from "Title (Media)" format
                                const mediaMatch = title.match(/(.+)\s*\((.+)\)$/);
                                if (mediaMatch) {
                                    title = mediaMatch[1].trim();
                                    publisher = mediaMatch[2].trim();
                                }

                                data.sources.push({
                                    sid: match[1],
                                    title: title,
                                    date: match[3].trim(),
                                    url: url,
                                    publisher: publisher
                                });
                            }
                        }
                    });
                }
            });

            return data;
        } catch (e) {
            console.error('Markdown structure parsing failed', e);
            return null;
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
                        d.why_it_matters?.forEach(w => textToCopy += `- (Structural Linkage) ${w.text}\n`);
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
                        r.impact_paths?.forEach(p => textToCopy += `  - Impact: ${p.text}\n`);
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

    if (!isOpen || !mounted) return null;

    return createPortal(
        <div
            className="modal-overlay"
            onClick={onClose}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 10000,
                backdropFilter: 'blur(8px)',
                padding: '20px'
            }}
        >
            <div
                className="modal-content report-modal"
                onClick={e => e.stopPropagation()}
                style={{
                    backgroundColor: 'var(--bg-card)',
                    width: '100%',
                    maxWidth: '900px',
                    maxHeight: '90vh',
                    height: 'auto',
                    borderRadius: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                    position: 'relative',
                    zIndex: 10001
                }}
            >
                <div className="modal-header">
                    <h2>{weeklyMode ? '🗓️ 주간 트렌드 리포트' : '📊 브리프 심층 리포트'}</h2>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <div className="modal-body">
                    {loading || isPolling ? (
                        <div className="loading-state">
                            <div className="loading-visual">
                                <div className="spinner"></div>
                            </div>
                            <div className="progress-stepper">
                                <div className={`step-item ${loadingStep >= 1 ? 'active' : ''} ${loadingStep > 1 ? 'completed' : ''}`}>
                                    <span className="step-icon">{loadingStep > 1 ? '✓' : '1'}</span>
                                    <span className="step-label">뉴스 수집</span>
                                </div>
                                <div className={`step-line ${loadingStep > 1 ? 'filled' : ''}`}></div>
                                <div className={`step-item ${loadingStep >= 2 ? 'active' : ''} ${loadingStep > 2 ? 'completed' : ''}`}>
                                    <span className="step-icon">{loadingStep > 2 ? '✓' : '2'}</span>
                                    <span className="step-label">클러스터링</span>
                                </div>
                                <div className={`step-line ${loadingStep > 2 ? 'filled' : ''}`}></div>
                                <div className={`step-item ${loadingStep >= 3 ? 'active' : ''}`}>
                                    <span className="step-icon">3</span>
                                    <span className="step-label">리포트 작성</span>
                                </div>
                            </div>
                            <p className="status-message-large">{statusMessage}</p>
                            {weeklyMode && (
                                <span className="loading-tip">💡 AI가 지난 1주일간의 기사를 분석하고 있습니다. 잠시만 기다려주세요.</span>
                            )}
                        </div>
                    ) : (
                        <div className="report-content">
                            {/* Raw Markdown Fallback or Failed Parsing */}
                            {!parsedReport && (
                                <div className="markdown-content">
                                    <ReactMarkdown>{localReport || report}</ReactMarkdown>
                                </div>
                            )}

                            {/* Structured Report View (Unified for Weekly & Deep Dive) */}
                            {parsedReport && (
                                <>
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
                                            <h4>{weeklyMode ? '[Top Strategic Signal]' : '[Signal Summary]'}</h4>
                                            <ul className="report-list">
                                                {parsedReport.executive_summary?.signal_summary?.map((s, i) => <li key={i}>{s.text}</li>)}
                                            </ul>
                                            <h4>{weeklyMode ? '[Converged Mega Trend]' : '[What Changed]'}</h4>
                                            <ul className="report-list">
                                                {parsedReport.executive_summary?.what_changed?.map((s, i) => <li key={i}>{s.text}</li>)}
                                            </ul>
                                            <h4>{weeklyMode ? '[Strategic Recommendation]' : '[So What]'}</h4>
                                            <ul className="report-list">
                                                {parsedReport.executive_summary?.so_what?.map((s, i) => <li key={i}>{s.text}</li>)}
                                            </ul>
                                        </div>
                                    </section>

                                    <section className="report-section">
                                        <h2 className="section-title">{weeklyMode ? '■ Structural Cluster Analysis' : '■ Key Developments'}</h2>
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
                                        <h2 className="section-title">{weeklyMode ? '■ Second-Order Economic Insights' : '■ Core Themes'}</h2>
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
                                                <strong>[{r.type.toUpperCase()}] {r.risk}</strong>
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

                                    {/* 🔧 FIX #4: 빈 Sources 섹션 숨김 */}
                                    {(parsedReport.sources?.length ?? 0) > 0 && (
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
                                    )}

                                    {/* 🔧 FIX #4: 빈 Analysis Quality 섹션 완전 숨김 */}
                                    {((parsedReport.quality?.coverage_gaps?.length ?? 0) > 0 ||
                                        (parsedReport.quality?.conflicts?.length ?? 0) > 0 ||
                                        (parsedReport.quality?.low_evidence_points?.length ?? 0) > 0) && (
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
                                        )}
                                </>
                            )}
                        </div>
                    )}

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
                @keyframes modalFadeUp {
                    from { opacity: 0; transform: translateY(20px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .modal-content.report-modal {
                    animation: modalFadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) !important;
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
                    min-height: 400px; height: 100%; gap: 1rem; color: var(--text-secondary);
                }
                .loading-visual { margin-bottom: 2rem; }
                .progress-stepper { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.5rem; }
                .step-item { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; position: relative; opacity: 0.4; transition: all 0.3s; }
                .step-item.active { opacity: 1; transform: scale(1.05); }
                .step-item.completed { opacity: 1; color: var(--accent-color); }
                .step-icon { width: 32px; height: 32px; border-radius: 50%; background: var(--bg-card); border: 2px solid var(--text-secondary); display: flex; justify-content: center; align-items: center; font-weight: 700; z-index: 1; }
                .step-item.active .step-icon { border-color: var(--accent-color); background: var(--bg-body); color: var(--accent-color); box-shadow: 0 0 10px rgba(99, 102, 241, 0.4); }
                .step-item.completed .step-icon { background: var(--accent-color); border-color: var(--accent-color); color: white; }
                .step-line { width: 40px; height: 2px; background: var(--border-color); margin-top: -14px; }
                .step-line.filled { background: var(--accent-color); }
                .step-label { font-size: 0.8rem; font-weight: 600; white-space: nowrap; }
                .status-message-large { font-size: 1.1rem; font-weight: 600; color: var(--text-primary); text-align: center; margin-bottom: 0.5rem; }

                .spinner {
                    width: 60px; height: 60px;
                    border: 4px solid rgba(255, 255, 255, 0.1);
                    border-left-color: #6366f1;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
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
                    text-decoration: none;
                    font-size: 0.8rem;
                    color: var(--text-primary);
                    transition: all 0.2s;
                    border: 1px solid var(--border-color);
                    padding: 4px 8px;
                    border-radius: 6px;
                    background: var(--bg-body);
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

                .markdown-content {
                    color: var(--text-primary);
                    line-height: 1.7;
                    font-size: 1rem;
                    user-select: text;
                    -webkit-user-select: text;
                }
                .markdown-content h1 { font-size: 1.8rem; font-weight: 800; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 2px solid var(--border-color); color: var(--text-primary); }
                .markdown-content h2 { font-size: 1.2rem; font-weight: 800; margin-top: 2.5rem; margin-bottom: 1.25rem; color: var(--accent-color); border-left: 5px solid var(--accent-color); padding-left: 0.75rem; background: linear-gradient(90deg, var(--bg-body) 0%, transparent 100%); padding-top: 0.5rem; padding-bottom: 0.5rem; border-radius: 0 4px 4px 0; }
                .markdown-content h3 { font-size: 1.1rem; font-weight: 700; margin-top: 1.5rem; margin-bottom: 0.75rem; color: var(--text-primary); background-color: var(--bg-body); padding: 0.5rem 1rem; border-radius: 6px; border: 1px solid var(--border-color); display: inline-block; }
                .markdown-content p { margin-bottom: 1rem; color: var(--text-secondary); }
                .markdown-content ul { padding-left: 1.2rem; margin-bottom: 1.25rem; }
                .markdown-content li { margin-bottom: 0.5rem; color: var(--text-secondary); }

                @media (max-width: 640px) {
                    .modal-overlay { padding: 10px; }
                    .modal-content.report-modal {
                        width: 100%; height: 100vh; maxHeight: 100vh; border-radius: 0;
                    }
                    .modal-header h2 { font-size: 1.1rem; }
                    .modal-body { padding: 1rem; }
                    .report-title { font-size: 1.3rem; }
                    .report-badge-row { gap: 0.25rem; }
                    .badge { font-size: 0.7rem; padding: 2px 4px; }
                    
                    .progress-stepper { gap: 0.25rem; }
                    .step-icon { width: 24px; height: 24px; font-size: 0.7rem; }
                    .step-line { width: 20px; }
                    .step-label { font-size: 0.65rem; }
                    .status-message-large { font-size: 1rem; }
                    .loading-visual .spinner { width: 40px; height: 40px; }

                    .implications-grid, .watchlist-grid { grid-template-columns: 1fr; }
                    .modal-footer { flex-direction: column-reverse; padding: 1rem; gap: 0.75rem; }
                    .modal-footer .btn { width: 100%; justify-content: center; height: 44px; }
                }
            `}</style>
            </div>
        </div>,
        document.body
    );
}
