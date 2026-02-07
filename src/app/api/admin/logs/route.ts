import { NextResponse } from 'next/server';
import { getLogs } from '@/lib/store';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '100', 10);

        const logs = await getLogs(limit);

        return NextResponse.json({
            success: true,
            data: logs
        });
    } catch (error) {
        console.error('Failed to fetch logs:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch logs' },
            { status: 500 }
        );
    }
}
