
'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { IssueItem } from '@/types';

export type CartItem = IssueItem & {
    originalBriefDate: string; // e.g., "2024-02-18"
    id: string; // usually headline
};

interface BriefCartContextType {
    items: CartItem[];
    manualUrls: string[];
    manualTexts: string[]; // 원문 텍스트 붙여넣기
    addToCart: (issue: IssueItem, date: string) => void;
    removeFromCart: (headline: string) => void;
    clearCart: () => void;
    isInCart: (headline: string) => boolean;

    // Manual URLs
    addManualUrl: (url: string) => void;
    removeManualUrl: (index: number) => void;
    updateManualUrl: (index: number, url: string) => void;
    setManualUrls: (urls: string[]) => void;

    // Manual Texts (원문 붙여넣기)
    addManualText: () => void;
    removeManualText: (index: number) => void;
    updateManualText: (index: number, text: string) => void;
}

const BriefCartContext = createContext<BriefCartContextType | undefined>(undefined);

export function BriefCartProvider({ children }: { children: React.ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([]);
    const [manualUrls, setManualUrlsState] = useState<string[]>(['']);
    const [manualTexts, setManualTextsState] = useState<string[]>([]);

    // Load from localStorage on mount
    useEffect(() => {
        const savedItems = localStorage.getItem('brief-cart-items');
        const savedUrls = localStorage.getItem('brief-cart-urls');
        const savedTexts = localStorage.getItem('brief-cart-texts');
        if (savedItems) setItems(JSON.parse(savedItems));
        if (savedUrls) setManualUrlsState(JSON.parse(savedUrls));
        if (savedTexts) setManualTextsState(JSON.parse(savedTexts));
    }, []);

    // Save to localStorage on change
    useEffect(() => {
        localStorage.setItem('brief-cart-items', JSON.stringify(items));
    }, [items]);

    useEffect(() => {
        localStorage.setItem('brief-cart-urls', JSON.stringify(manualUrls));
    }, [manualUrls]);

    useEffect(() => {
        localStorage.setItem('brief-cart-texts', JSON.stringify(manualTexts));
    }, [manualTexts]);

    const addToCart = (issue: IssueItem, date: string) => {
        if (items.some(i => i.headline === issue.headline)) return;
        const newItem: CartItem = {
            ...issue,
            originalBriefDate: date,
            id: issue.headline
        };
        setItems(prev => [...prev, newItem]);
    };

    const removeFromCart = (headline: string) => {
        setItems(prev => prev.filter(i => i.headline !== headline));
    };

    const clearCart = () => {
        setItems([]);
        setManualUrlsState(['']);
        setManualTextsState([]);
    };

    const isInCart = (headline: string) => {
        return items.some(i => i.headline === headline);
    };

    // Manual URL actions
    const addManualUrl = (url: string) => setManualUrlsState(prev => [...prev, url]);
    const removeManualUrl = (index: number) => setManualUrlsState(prev => prev.filter((_, i) => i !== index));
    const updateManualUrl = (index: number, url: string) => {
        setManualUrlsState(prev => {
            const newUrls = [...prev];
            newUrls[index] = url;
            return newUrls;
        });
    };
    const setManualUrls = (urls: string[]) => setManualUrlsState(urls);

    // Manual Text actions
    const addManualText = () => setManualTextsState(prev => [...prev, '']);
    const removeManualText = (index: number) => setManualTextsState(prev => prev.filter((_, i) => i !== index));
    const updateManualText = (index: number, text: string) => {
        setManualTextsState(prev => {
            const newTexts = [...prev];
            newTexts[index] = text;
            return newTexts;
        });
    };

    return (
        <BriefCartContext.Provider value={{
            items,
            manualUrls,
            manualTexts,
            addToCart,
            removeFromCart,
            clearCart,
            isInCart,
            addManualUrl,
            removeManualUrl,
            updateManualUrl,
            setManualUrls,
            addManualText,
            removeManualText,
            updateManualText,
        }}>
            {children}
        </BriefCartContext.Provider>
    );
}

export function useBriefCart() {
    const context = useContext(BriefCartContext);
    if (context === undefined) {
        throw new Error('useBriefCart must be used within a BriefCartProvider');
    }
    return context;
}
