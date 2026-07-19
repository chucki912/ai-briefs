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

    // 관리자 모드 체크 로직 — B2 세션 영속화 (2026-07-19 정책 변경)
    // 구 정책: 파라미터 없는 로드는 무조건 권한 해제("매우 엄격하게 적용") → 링크 이동·재방문마다
    // 심층 리포트 등 admin 버튼이 사라져 구 통합 버튼으로 오도되는 문제 실측(#9 배선 감사).
    // 신 정책: ?admin=true 1회 부여 후 localStorage로 유지, ?admin=false로만 명시 해제.
    const checkAdmin = () => {
        setLoading(true);
        const adminParam = searchParams.get('admin');

        if (adminParam === 'true' || adminParam === 'secret_key') {
            setIsAdmin(true);
            localStorage.setItem('is_admin_mode', 'true');
        } else if (adminParam === 'false') {
            setIsAdmin(false);
            localStorage.removeItem('is_admin_mode');
        } else {
            // 파라미터 없음 → 저장된 세션 존중
            setIsAdmin(localStorage.getItem('is_admin_mode') === 'true');
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
