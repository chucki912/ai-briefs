'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface LogEntry {
    id: string;
    timestamp: number;
    action: string;
    targetId: string;
    metadata: any;
    ip?: string;
}

interface CartRequest {
    id: string;
    timestamp: number;
    ip: string;
    itemCount: number;
    items: string[];
}

export default function AdminDashboard() {
    const { isAdmin, loading: authLoading } = useAuth();
    const router = useRouter();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [cartRequests, setCartRequests] = useState<CartRequest[]>([]);
    const [activeTab, setActiveTab] = useState<'logs' | 'carts'>('logs');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !isAdmin) {
            router.push('/');
        }
    }, [isAdmin, authLoading, router]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [logsRes, cartsRes] = await Promise.all([
                fetch('/api/admin/logs?admin=true'),
                fetch('/api/admin/cart-requests?admin=true')
            ]);

            const logsData = await logsRes.json();
            const cartsData = await cartsRes.json();

            setLogs(logsData.logs || []);
            setCartRequests(cartsData.requests || []);
        } catch (error) {
            console.error('Failed to fetch admin data', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isAdmin) {
            fetchData();
        }
    }, [isAdmin]);

    if (authLoading || !isAdmin) {
        return (
            <div className="admin-loading">
                <div className="spinner" />
                <span>Checking credentials...</span>
            </div>
        );
    }

    return (
        <div className="admin-container">
            <header className="admin-header">
                <div>
                    <h1>Admin <span className="highlight">Command Center</span></h1>
                    <p className="subtitle">Real-time monitoring and system management</p>
                </div>
                <button className="refresh-btn" onClick={fetchData} disabled={loading}>
                    {loading ? 'Updating...' : '🔄 Refresh Data'}
                </button>
            </header>

            <nav className="admin-nav">
                <button
                    className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`}
                    onClick={() => setActiveTab('logs')}
                >
                    📜 Action Logs
                </button>
                <button
                    className={`nav-item ${activeTab === 'carts' ? 'active' : ''}`}
                    onClick={() => setActiveTab('carts')}
                >
                    🛒 Cart Requests
                </button>
            </nav>

            <main className="admin-main">
                {activeTab === 'logs' ? (
                    <div className="grid-list">
                        {logs.length === 0 ? (
                            <p className="no-data">No activity logs recorded yet.</p>
                        ) : (
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Time</th>
                                        <th>Action</th>
                                        <th>Target</th>
                                        <th>IP Address</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map(log => (
                                        <tr key={log.id}>
                                            <td>{new Date(log.timestamp).toLocaleString()}</td>
                                            <td><span className={`tag tag-${log.action.toLowerCase()}`}>{log.action}</span></td>
                                            <td className="truncate" title={log.targetId}>{log.targetId}</td>
                                            <td>{log.ip || 'Unknown'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                ) : (
                    <div className="grid-list">
                        {cartRequests.length === 0 ? (
                            <p className="no-data">No user cart requests yet.</p>
                        ) : (
                            <div className="request-cards">
                                {cartRequests.map(req => (
                                    <div key={req.id} className="request-card">
                                        <div className="card-header">
                                            <span className="card-time">{new Date(req.timestamp).toLocaleString()}</span>
                                            <span className="card-ip">{req.ip}</span>
                                        </div>
                                        <h3 className="card-title">{req.itemCount} items requested</h3>
                                        <ul className="card-items">
                                            {req.items.map((item, idx) => (
                                                <li key={idx}>{item}</li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>

            <style jsx>{`
                .admin-container {
                    padding: 40px;
                    max-width: 1200px;
                    margin: 0 auto;
                    color: var(--text-primary);
                }
                .admin-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 40px;
                }
                h1 { font-size: 2.5rem; margin: 0; }
                .highlight { color: var(--accent-color); }
                .subtitle { color: var(--text-secondary); margin: 8px 0 0 0; }
                .refresh-btn {
                    padding: 10px 20px;
                    border-radius: 99px;
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    color: var(--text-primary);
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .refresh-btn:hover { background: var(--bg-secondary); }

                .admin-nav {
                    display: flex;
                    gap: 12px;
                    margin-bottom: 30px;
                    border-bottom: 1px solid var(--border-color);
                    padding-bottom: 12px;
                }
                .nav-item {
                    background: none;
                    border: none;
                    padding: 8px 16px;
                    font-size: 1rem;
                    font-weight: 600;
                    color: var(--text-secondary);
                    cursor: pointer;
                    border-radius: 8px;
                }
                .nav-item.active {
                    color: var(--accent-color);
                    background: var(--accent-light);
                }

                .admin-table {
                    width: 100%;
                    border-collapse: collapse;
                    background: var(--bg-card);
                    border-radius: 16px;
                    overflow: hidden;
                    box-shadow: var(--shadow-sm);
                }
                th, td { padding: 16px; text-align: left; border-bottom: 1px solid var(--border-color); }
                th { background: rgba(0,0,0,0.05); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
                .truncate { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                
                .tag { padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; }
                .tag-view_brief { background: #e0f2fe; color: #0369a1; }
                .tag-generate_report { background: #fef3c7; color: #92400e; }
                .tag-click_source { background: #f1f5f9; color: #475569; }

                .request-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
                .request-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 20px; }
                .card-header { display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 12px; }
                .card-title { font-size: 1.1rem; margin: 0 0 12px 0; }
                .card-items { padding-left: 20px; font-size: 0.85rem; color: var(--text-secondary); }
                .card-items li { margin-bottom: 4px; }

                .no-data { text-align: center; padding: 60px; color: var(--text-secondary); }
                .admin-loading { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; }
                .spinner { width: 40px; height: 40px; border: 4px solid var(--accent-light); border-top-color: var(--accent-color); border-radius: 50%; animation: spin 1s linear infinite; }
                @keyframes spin { to { transform: rotate(360deg); } }

                @media (max-width: 640px) {
                    .admin-container { padding: 20px; }
                    .admin-header { flex-direction: column; align-items: flex-start; gap: 1.5rem; }
                    h1 { font-size: 1.8rem; }
                    .refresh-btn { width: 100%; justify-content: center; }
                    .admin-nav { overflow-x: auto; padding-bottom: 8px; }
                    .nav-item { white-space: nowrap; padding: 6px 12px; font-size: 0.9rem; }
                    
                    /* Make table scrollable on mobile */
                    .grid-list { overflow-x: auto; -webkit-overflow-scrolling: touch; }
                    .admin-table { min-width: 600px; }
                    
                    .request-cards { grid-template-columns: 1fr; }
                }
            `}</style>
        </div>
    );
}
