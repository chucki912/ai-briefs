import { NextRequest, NextResponse } from 'next/server';
import { saveLog, ActivityLog } from '@/lib/store';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, targetId, metadata } = body;

        if (!action || !targetId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const log: ActivityLog = {
            id: uuidv4(),
            timestamp: Date.now(),
            action,
            targetId,
            metadata: metadata || {},
            userAgent: request.headers.get('user-agent') || undefined,
            ip: request.headers.get('x-forwarded-for') || undefined,
        };

        // Fire and forget (don't wait for save to complete to speed up response)
        saveLog(log).catch(err => console.error('[Log Error]', err));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Log API Error]', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
