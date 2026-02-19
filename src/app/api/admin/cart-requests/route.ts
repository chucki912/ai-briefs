import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/store';

export async function GET(request: NextRequest) {
    const adminParam = request.nextUrl.searchParams.get('admin');
    if (adminParam !== 'true' && adminParam !== 'secret_key') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const storage = getStorage();
        const requests = await storage.kvGet<any[]>('cart_request_list') || [];
        return NextResponse.json({ requests });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch cart requests' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const adminParam = request.nextUrl.searchParams.get('admin');
    if (adminParam !== 'true' && adminParam !== 'secret_key') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const storage = getStorage();
        await storage.kvSet('cart_request_list', []);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to clear cart requests' }, { status: 500 });
    }
}
