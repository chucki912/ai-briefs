
type LogAction = 'VIEW_BRIEF' | 'CLICK_ISSUE' | 'SHARE_ISSUE' | 'GENERATE_TREND_REPORT' | 'CLICK_SOURCE' | 'VIEW_TREND_REPORT';

interface LogPayload {
    action: LogAction;
    targetId: string;
    metadata?: Record<string, any>;
}

export const logger = {
    log: (payload: LogPayload) => {
        try {
            // Use sendBeacon if available for better reliability on unload, otherwise fetch
            const url = '/api/log';
            const data = JSON.stringify(payload);

            if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
                const blob = new Blob([data], { type: 'application/json' });
                navigator.sendBeacon(url, blob);
            } else {
                fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: data,
                    keepalive: true,
                }).catch(console.error);
            }
        } catch (error) {
            console.error('[Logger] Failed to log activity:', error);
        }
    },

    // Convenience methods
    viewBrief: (date: string) => logger.log({ action: 'VIEW_BRIEF', targetId: date }),
    clickSource: (url: string, issueId: string) => logger.log({ action: 'CLICK_SOURCE', targetId: issueId, metadata: { url } }),
    generateReport: (issueId: string, topic: string) => logger.log({ action: 'GENERATE_TREND_REPORT', targetId: issueId, metadata: { topic } }),
    viewReport: (issueId: string) => logger.log({ action: 'VIEW_TREND_REPORT', targetId: issueId }),
};
