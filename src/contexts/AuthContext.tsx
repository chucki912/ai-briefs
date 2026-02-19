'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';

interface AuthContextType {
    isAdmin: boolean;
    loading: boolean;
    checkAdmin: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const searchParams = useSearchParams();

    // 관리자 모드 체크 로직
    const checkAdmin = () => {
        setLoading(true);
        // 1. URL 파라미터 체크 (?admin=true 또는 특정 키)
        const adminParam = searchParams.get('admin');

        // 2. 관리자 파라미터가 있는 경우에만 권한 부여 (매우 엄격하게 적용)
        if (adminParam === 'true' || adminParam === 'secret_key') {
            setIsAdmin(true);
            localStorage.setItem('is_admin_mode', 'true');
        } else {
            // 파라미터가 없으면 무조건 권한 해제 (기존 세션도 만료 처리)
            setIsAdmin(false);
            localStorage.removeItem('is_admin_mode');
        }
        setLoading(false);
    };

    useEffect(() => {
        checkAdmin();
    }, [searchParams]);

    return (
        <AuthContext.Provider value={{ isAdmin, loading, checkAdmin }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
