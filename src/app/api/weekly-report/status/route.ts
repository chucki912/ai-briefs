import { NextResponse } from 'next/server';
import { kvGet } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const jobId = searchParams.get('jobId');

        if (!jobId) {
            return NextResponse.json({ error: 'Job ID required' }, { status: 400 });
        }

        const jobData = await kvGet(`weekly_job:${jobId}`);

        if (!jobData) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            data: jobData
        });
    } catch (error) {
        console.error('Weekly report status check error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
