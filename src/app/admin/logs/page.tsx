'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ActivityLog {
    id: string;
    timestamp: number;
    action: string;
    targetId: string;
    userAgent: string;
    ip: string;
    metadata?: any;
}

export default function AdminLogsPage() {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Authentication State
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState('');

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (password === '0108') {
            setIsAuthenticated(true);
        } else {
            alert('비밀번호가 틀렸습니다.');
        }
    };

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const res = await fetch('/api/admin/logs?limit=100');
                const data = await res.json();

                if (data.success) {
                    setLogs(data.data);
                } else {
                    setError('Failed to load logs');
                }
            } catch (err) {
                setError('Failed to fetch logs');
            } finally {
                setLoading(false);
            }
        };

        fetchLogs();
    }, []);

    if (!isAuthenticated) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
                <form onSubmit={(e) => { e.preventDefault(); if (password === '0108') setIsAuthenticated(true); else alert('비밀번호가 틀렸습니다.'); }} className="bg-gray-800 p-8 rounded-lg shadow-lg border border-gray-700">
                    <h2 className="text-2xl font-bold mb-6 text-center">🔐 Admin Access</h2>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter Password"
                        className="w-full p-3 bg-gray-900 border border-gray-600 rounded mb-4 focus:border-blue-500 outline-none transition-colors"
                        autoFocus
                    />
                    <button
                        type="submit"
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded font-bold transition-colors"
                    >
                        Login
                    </button>
                    <div className="mt-4 text-center">
                        <Link href="/" className="text-sm text-gray-400 hover:text-white">
                            Back to Home
                        </Link>
                    </div>
                </form>
            </div>
        );
    }

    if (loading) return <div className="p-8 text-center text-xl text-white">Loading logs...</div>;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

    return (
        <div className="container p-8 max-w-7xl mx-auto">
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">📊 Activity Logs</h1>
                <Link href="/" className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700">
                    Back to Home
                </Link>
            </header>

            <div className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-400">
                        <thead className="bg-gray-800 text-xs uppercase text-gray-200">
                            <tr>
                                <th className="px-6 py-3">Timestamp</th>
                                <th className="px-6 py-3">Action</th>
                                <th className="px-6 py-3">Target</th>
                                <th className="px-6 py-3">Metadata</th>
                                <th className="px-6 py-3">IP / UA</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {logs.map((log) => (
                                <tr key={log.id} className="hover:bg-gray-800/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-300">
                                        {new Date(log.timestamp).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-blue-400">
                                        {log.action}
                                    </td>
                                    <td className="px-6 py-4 text-gray-300 truncate max-w-xs" title={log.targetId}>
                                        {log.targetId}
                                    </td>
                                    <td className="px-6 py-4 text-gray-400 max-w-xs break-all">
                                        {log.metadata ? JSON.stringify(log.metadata) : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-xs text-gray-500 max-w-xs truncate" title={`${log.ip} | ${log.userAgent}`}>
                                        <div className="mb-1">{log.ip}</div>
                                        <div>{log.userAgent}</div>
                                    </td>
                                </tr>
                            ))}
                            {logs.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                                        No logs found. Is logging working?
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <style jsx>{`
                /* Additional manual styles if needed, mostly using inline tailwind-like classes where simple */
                .container { color: #e5e7eb; }
                table { border-collapse: collapse; }
                th, td { border-bottom: 1px solid #374151; }
                tr:last-child td { border-bottom: none; }
            `}</style>
        </div>
    );
}
