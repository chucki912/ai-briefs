# Gemini 모델 검증 가이드

프로젝트에서 사용 중인 Gemini 모델이 유효한지 확인하는 방법입니다.

## 📋 현재 모델 설정

| 상수명 | 모델명 | 용도 |
|--------|--------|------|
| `FLASH_MODEL` | `gemini-3.5-flash` | 빠른 분석 (뉴스 분석, 클러스터링) |
| `PRO_MODEL` | `gemini-3.1-pro-preview` | 심층 리포트 (상세 분석) |

---

## ✅ 검증 방법

### 1️⃣ **npm 스크립트로 검증 (권장)**

```bash
# 터미널에서 실행
npm run check:gemini
```

이 명령어는 다음을 수행합니다:
- ✅ 모든 모델에 대해 간단한 테스트 요청 전송
- ⏱️ 각 모델의 응답 시간 측정
- 📊 결과 요약 및 오류 보고

**예상 출력:**
```
✅ gemini-3.5-flash - OK (응답 시간: 1234ms)
✅ gemini-3.1-pro-preview - OK (응답 시간: 2456ms)

총 검증: 2개 | 성공: 2개 | 실패: 0개
```

---

### 2️⃣ **직접 curl 요청으로 테스트**

#### 준비사항
- **API Key 설정**:
  ```bash
  export GEMINI_API_KEY=your_actual_api_key_here
  ```

#### 개별 모델 테스트

##### Flash 모델 (빠른 분석)
```bash
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [{
        "text": "Respond with: Model is working correctly."
      }]
    }]
  }' | jq '.candidates[0].content.parts[0].text'
```

##### Pro 모델 (심층 분석)
```bash
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [{
        "text": "Respond with: Model is working correctly."
      }]
    }]
  }' | jq '.candidates[0].content.parts[0].text'
```

---

### 3️⃣ **Python으로 간단히 테스트**

```python
import os
from google.generativeai import GenerativeAI

# API 키 설정
api_key = os.getenv('GEMINI_API_KEY')
if not api_key:
    raise ValueError("GEMINI_API_KEY 환경 변수를 설정하세요")

genai = GenerativeAI(api_key=api_key)

# 테스트할 모델들
models = [
    "gemini-3.5-flash",
    "gemini-3.1-pro-preview"
]

for model_name in models:
    try:
        model = genai.GenerativeModel(model_name)
        response = model.generate_content("Hello, are you working?")
        print(f"✅ {model_name}: OK")
        print(f"   응답: {response.text[:50]}...\n")
    except Exception as e:
        print(f"❌ {model_name}: Failed")
        print(f"   오류: {str(e)}\n")
```

---

## 🚨 문제 해결

### ❌ "Model not found" 오류
- **원인**: 모델명이 잘못되었거나 사용 불가능
- **해결**: [Google AI Studio](https://aistudio.google.com/app/apikey)에서 사용 가능한 모델 확인
- **조치**: `src/lib/gemini-models.ts` 에서 모델명 업데이트

### ❌ "Invalid API Key" 오류
- **원인**: API 키가 설정되지 않았거나 잘못됨
- **해결**: 
  ```bash
  export GEMINI_API_KEY=your_correct_api_key
  echo $GEMINI_API_KEY  # 확인
  ```

### ⚠️ "Rate limit exceeded" 오류
- **원인**: API 호출 제한 초과
- **해결**: 몇 분 대기 후 재시도

### 🐌 응답이 느린 경우
- Flash 모델이 더 빠릅니다 (응답 시간 ~1-2초)
- Pro 모델은 더 느릴 수 있습니다 (응답 시간 ~2-5초)
- 네트워크 상태를 확인하세요

---

## 📊 모델 선택 가이드

| 상황 | 권장 모델 | 이유 |
|------|----------|------|
| 뉴스 분석 | `FLASH_MODEL` | 빠른 분석 필요, 비용 효율 |
| 클러스터링 | `FLASH_MODEL` | 자주 호출, 낮은 지연시간 필요 |
| 심층 리포트 | `PRO_MODEL` | 높은 품질, 복잡한 추론 |
| 검색 기반 분석 | `PRO_MODEL` | Google Search 도구와의 호환성 |

---

## 🔄 모델 업그레이드 절차

새 모델이 출시되었을 때:

1. **모델명 확인**: https://aistudio.google.com/app/apikey
2. **상수 업데이트**: `src/lib/gemini-models.ts` 수정
3. **검증**: `npm run check:gemini` 실행
4. **테스트**: 프로젝트 테스트 스위트 실행
5. **배포**: 모든 시스템에 배포

예시:
```typescript
// src/lib/gemini-models.ts
export const FLASH_MODEL = 'gemini-4-flash-preview';  // ← 업데이트
export const PRO_MODEL = 'gemini-4-pro-preview';      // ← 업데이트
```

---

## 📞 추가 도움말

- [Google Generative AI API 문서](https://ai.google.dev/docs)
- [모델 비교](https://ai.google.dev/models)
- [API 오류 해결](https://ai.google.dev/docs/troubleshooting)
