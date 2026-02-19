import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/store';

export async function GET(request: NextRequest) {
    const adminParam = request.nextUrl.searchParams.get('admin');
    if (adminParam !== 'true' && adminParam !== 'secret_key') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const storage = getStorage();
        const logs = await storage.getLogs(100);
        return NextResponse.json({ logs });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }
}
