'use client';

import { Suspense } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { BriefCartProvider } from '@/contexts/BriefCartContext';
import BriefCart from '@/components/BriefCart';

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={null}>
            <AuthProvider>
                <BriefCartProvider>
                    {children}
                    <BriefCart />
                </BriefCartProvider>
            </AuthProvider>
        </Suspense>
    );
}
