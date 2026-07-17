import { ReportType } from '@/types';

// 레거시 모드 추론의 유일한 생존 위치.
// reportType 필드 도입 이전의 저장 레코드는 저장 키(id/date)의 'battery-' 접두사가
// 유일한 모드 신호였음. 저장 키 자체를 넘겨도 되고(BriefReport 조각), 레코드를 넘겨도 됨.
// 일일 브리프 계열만 reportType 없이 영속 저장되므로 추론 결과는 두 모드로 한정됨.
export function inferLegacyReportType(record: { id?: string; date?: string }): ReportType {
    const key = record.id || record.date || '';
    return key.startsWith('battery-') ? 'battery_daily_brief' : 'daily_brief';
}

// 읽기 경로 공통 진입점: 명시적 reportType 우선, 없으면 레거시 추론 1회.
export function getReportType(record: { id?: string; date?: string; reportType?: ReportType }): ReportType {
    return record.reportType ?? inferLegacyReportType(record);
}
