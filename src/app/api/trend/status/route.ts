import { NextRequest, NextResponse } from 'next/server';
import { kvGet } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const jobId = searchParams.get('jobId');

        if (!jobId) {
            return NextResponse.json({ success: false, error: 'Job ID missing' }, { status: 400 });
        }

        const jobData = await kvGet(`trend_job:${jobId}`);

        if (!jobData) {
            return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, data: jobData });

    } catch (error) {
        console.error('[Status API Error]', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
