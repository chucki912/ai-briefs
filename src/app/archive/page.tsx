'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import IssueCard from '@/components/IssueCard';
import TrendReportModal from '@/components/TrendReportModal';
import { BriefReport, IssueItem } from '@/types';

interface BriefSummary {
    id: string;
    date: string;
    dayOfWeek: string;
    totalIssues: number;
    generatedAt: string;
}

export default function ArchivePage() {
    const [briefs, setBriefs] = useState<BriefSummary[]>([]);
    const [selectedBrief, setSelectedBrief] = useState<BriefReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingDetail, setLoadingDetail] = useState(false);

    // Trend Report State
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [reportContent, setReportContent] = useState('');
    const [reportLoading, setReportLoading] = useState(false);
    const [selectedReportIssue, setSelectedReportIssue] = useState<IssueItem | undefined>(undefined);

    // ... (rest of code)

    // 트렌드 리포트 생성 (Deep Dive)
    const handleDeepDive = async (issue: IssueItem) => {
        setIsReportModalOpen(true);
        setSelectedReportIssue(issue);
        setReportContent(''); // Reset previous report
        setReportLoading(true);

        try {
            const res = await fetch('/api/trend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ issue }),
            });
            const data = await res.json();

            if (data.success) {
                setReportContent(data.data.report);
            } else {
                setReportContent('### ⚠️ 리포트 생성 실패\n\n' + (data.error || '알 수 없는 오류가 발생했습니다.'));
            }
        } catch (err) {
            console.error('Trend Report Error:', err);
            setReportContent('### ⚠️ 리포트 생성 실패\n\n서버 연결 중 오류가 발생했습니다.');
        } finally {
            setReportLoading(false);
        }
    };

    return (
        <div className="container">
            {/* Header ... */}

            {/* ... (Main Content) ... */}

            <TrendReportModal
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
                report={reportContent}
                loading={reportLoading}
                issue={selectedReportIssue}
            />
        </div>
    );
}
