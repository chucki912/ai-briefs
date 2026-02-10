'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';

interface AuthContextType {
    isAdmin: boolean;
    checkAdmin: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [isAdmin, setIsAdmin] = useState(false);
    const searchParams = useSearchParams();

    // 관리자 모드 체크 로직
    const checkAdmin = () => {
        // 1. URL 파라미터 체크 (?admin=true 또는 특정 키)
        const adminParam = searchParams.get('admin');

        // 2. 관리자 파라미터가 있는 경우에만 권한 부여 (매우 엄격하게 적용)
        if (adminParam === 'true' || adminParam === 'secret_key') {
            setIsAdmin(true);
            // 편의를 위해 로컬 스토리지에 남길 수도 있지만, 
            // 사용자가 '일반 모드'로 진입 시(파라미터 없음) 확실히 해제되길 원하므로
            // 여기서는 스토리지 저장을 하지 않거나, 하더라도 아래 else에서 확실히 지워야 함.
            localStorage.setItem('is_admin_mode', 'true');
        } else {
            // 파라미터가 없으면 무조건 권한 해제 (기존 세션도 만료 처리)
            setIsAdmin(false);
            localStorage.removeItem('is_admin_mode');
        }
    };

    useEffect(() => {
        checkAdmin();
    }, [searchParams]);

    return (
        <AuthContext.Provider value={{ isAdmin, checkAdmin }}>
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
