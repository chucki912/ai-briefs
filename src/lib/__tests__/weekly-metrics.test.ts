/** 정량 수치 정의(extractQuantitativeMetrics/isQuantitativeMetric) 테스트.
 *  npx tsx src/lib/__tests__/weekly-metrics.test.ts */
import { extractQuantitativeMetrics, isQuantitativeMetric } from '../../configs/weekly-house-style';

let pass = 0, fail = 0;
const chk = (name: string, cond: boolean, d?: string) => {
    if (cond) { pass++; console.log(`[PASS] ${name}`); }
    else { fail++; console.log(`[FAIL] ${name}${d ? ' — ' + d : ''}`); }
};

// 인정: 단위 동반
chk('% 인정', isQuantitativeMetric('전년 대비 30% 증가'));
chk('대 인정', isQuantitativeMetric('557,090대 판매'));
chk('억 달러 인정', isQuantitativeMetric('49억 4천만 달러 규모'));
chk('Wh/kg 인정', isQuantitativeMetric('에너지 밀도 500Wh/kg'));
chk('km 인정', isQuantitativeMetric('900km 주행'));
chk('명 인정', isQuantitativeMetric('고용 5,500명'));
chk('개소 인정', isQuantitativeMetric('스테이션 18개소'));
chk('만(규모) 인정', isQuantitativeMetric('월 14만장'));
chk('배(규모) 인정', isQuantitativeMetric('전년 2배'));

// 불인정: 시점/버전
chk('ISO 주차 불인정', !isQuantitativeMetric('2026-W23'));
chk('연도 불인정', !isQuantitativeMetric('2026년'));
chk('연도 단독 불인정', !isQuantitativeMetric('2026'));
chk('날짜 불인정', !isQuantitativeMetric('2026-07-20'));
chk('버전 불인정', !isQuantitativeMetric('v1.2.3'));
chk('순수 텍스트 불인정', !isQuantitativeMetric('나트륨이온 배터리'));

// 혼합 문장: 시점 제거 후 정량만 추출
const mixed = extractQuantitativeMetrics('2026-W23부터 매출 30% 증가, 5,500명 고용, 2026년 기준');
chk('혼합: 정량만(30%, 5,500명)', mixed.some(m => m.includes('%')) && mixed.some(m => m.includes('명')));
chk('혼합: 시점 제외(2026-W23/2026년 없음)', mixed.every(m => !m.includes('W23') && !m.includes('2026년')));

// DoD #7 시나리오: metricsUsed에 시점 섞였을 때 유효 카운트
const metricsUsed = ['2026-W23', '30%', '557,090대', '월 14만장'];
const valid = metricsUsed.filter(isQuantitativeMetric);
chk('DoD#7: 시점 제외 후 3개', valid.length === 3, JSON.stringify(valid));

console.log(`\n${fail === 0 ? '✅' : '❌'} weekly-metrics: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
