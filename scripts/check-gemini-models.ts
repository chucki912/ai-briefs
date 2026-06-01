#!/usr/bin/env npx tsx

/**
 * Gemini 모델 유효성 검증 스크립트
 * 
 * 사용법:
 *   npm run check:gemini
 *   또는
 *   npx tsx scripts/check-gemini-models.ts
 * 
 * 이 스크립트는 프로젝트에서 정의한 Gemini 모델이 실제로 유효한지 확인합니다.
 * GEMINI_API_KEY 환경 변수가 필요합니다.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import {
    FLASH_MODEL,
    PRO_MODEL,
} from '../src/lib/gemini-models';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error('❌ Error: GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.');
    console.error('   export GEMINI_API_KEY=your_api_key 를 실행 후 다시 시도하세요.');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

interface ModelCheckResult {
    modelName: string;
    purpose: string;
    isValid: boolean;
    error?: string;
    latency?: number;
}

async function checkModel(modelName: string, purpose: string): Promise<ModelCheckResult> {
    const startTime = Date.now();
    try {
        console.log(`\n⏳ 확인 중: ${modelName} (${purpose})`);
        
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent('Hello, please respond with "OK".');
        const response = await result.response;
        
        const latency = Date.now() - startTime;
        const text = response.text();
        
        console.log(`✅ ${modelName} - OK (응답 시간: ${latency}ms)`);
        return {
            modelName,
            purpose,
            isValid: true,
            latency,
        };
    } catch (error: any) {
        const latency = Date.now() - startTime;
        const errorMessage = error?.message || String(error);
        
        console.log(`❌ ${modelName} - 실패 (${errorMessage})`);
        return {
            modelName,
            purpose,
            isValid: false,
            error: errorMessage,
            latency,
        };
    }
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║       Gemini 모델 유효성 검증 스크립트                   ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\nAPI Key: ${apiKey.substring(0, 10)}...${apiKey.substring(-10)}`);
    console.log('\n검증할 모델:');
    console.log(`  1. FLASH_MODEL  = "${FLASH_MODEL}"`);
    console.log(`  2. PRO_MODEL    = "${PRO_MODEL}"`);

    const results = await Promise.all([
        checkModel(FLASH_MODEL, '빠른 분석 (Flash)'),
        checkModel(PRO_MODEL, '심층 리포트 (Pro)'),
    ]);

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                      검증 결과 요약                       ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const validModels = results.filter(r => r.isValid);
    const invalidModels = results.filter(r => !r.isValid);

    if (validModels.length > 0) {
        console.log('✅ 유효한 모델 (' + validModels.length + '개):');
        validModels.forEach(r => {
            console.log(`   • ${r.modelName}`);
            console.log(`     목적: ${r.purpose}`);
            console.log(`     응답 시간: ${r.latency}ms\n`);
        });
    }

    if (invalidModels.length > 0) {
        console.log('❌ 무효한 모델 (' + invalidModels.length + '개):');
        invalidModels.forEach(r => {
            console.log(`   • ${r.modelName}`);
            console.log(`     목적: ${r.purpose}`);
            console.log(`     오류: ${r.error}\n`);
        });
    }

    console.log('─────────────────────────────────────────────────────────────');
    console.log(`총 검증: ${results.length}개 | 성공: ${validModels.length}개 | 실패: ${invalidModels.length}개`);
    console.log('─────────────────────────────────────────────────────────────\n');

    if (invalidModels.length > 0) {
        console.log('💡 팁:');
        console.log('   • Google AI Studio에서 모델 가용성을 확인하세요:');
        console.log('     https://aistudio.google.com/app/apikey');
        console.log('   • Gemini 모델 이름이 변경되었을 수 있습니다.');
        console.log('   • src/lib/gemini-models.ts 에서 상수를 업데이트하세요.\n');
        process.exit(1);
    } else {
        console.log('🎉 모든 모델이 정상 작동 중입니다!\n');
        process.exit(0);
    }
}

main().catch(error => {
    console.error('❌ 예기치 않은 오류:', error);
    process.exit(1);
});
