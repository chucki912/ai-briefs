import cron from 'node-cron';

// 브리핑 생성 함수
async function generateDailyBrief() {
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`\n========================================`);
            console.log(`[Scheduler] 일일 브리핑 생성 시작 (시도 ${attempt}/${maxRetries})`);
            console.log(`[Scheduler] 시간: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);
            console.log(`========================================\n`);

            // 브리핑 생성 API 호출
            const response = await fetch('http://localhost:3000/api/generate', {
                method: 'POST',
            });

            const result = await response.json();

            if (result.success) {
                console.log(`[Scheduler] ✅ 브리핑 생성 성공!`);
                console.log(`[Scheduler] 총 ${result.data.totalIssues}개 이슈 생성됨`);
                return;
            } else {
                throw new Error(result.error || '브리핑 생성 실패');
            }

        } catch (error) {
            console.error(`[Scheduler] ❌ 시도 ${attempt} 실패:`, error);

            if (attempt < maxRetries) {
                console.log(`[Scheduler] 30초 후 재시도...`);
                await new Promise(resolve => setTimeout(resolve, 30000));
            } else {
                console.error(`[Scheduler] 모든 재시도 실패. 관리자에게 알림 필요.`);
            }
        }
    }
}

// 매일 오전 7시 (KST) 실행
// cron 표현식: 분 시 일 월 요일
cron.schedule('0 7 * * *', generateDailyBrief, {
    timezone: 'Asia/Seoul',
});

console.log(`
================================================================================
                     AI Daily Brief 스케줄러 시작
================================================================================
  - 실행 시간: 매일 오전 7:00 (KST)
  - 재시도: 실패 시 최대 3회
  - 시작 시간: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
================================================================================
`);

// 테스트 모드: 즉시 실행
if (process.argv.includes('--now')) {
    console.log('[Scheduler] 테스트 모드: 즉시 실행');
    generateDailyBrief();
}

// 프로세스 유지
process.on('SIGINT', () => {
    console.log('\n[Scheduler] 스케줄러 종료');
    process.exit(0);
});
