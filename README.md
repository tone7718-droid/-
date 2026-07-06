# ROM Vision Tool

**실시간 관절 가동범위(ROM) 측정 · 동작 인식 · 피드백 웹 애플리케이션**

카메라로 사람의 움직임을 분석해 지금 어떤 운동을 하는지 인식하고,
관절 가동범위를 측정·시각화·기록한다. 모든 처리가 브라우저 안에서 이루어지며
영상·데이터는 어디에도 전송되지 않는다 (서버 코드 0줄).

---

## 실행

정적 파일이라 아무 HTTP 서버로 열면 된다 (카메라 권한 때문에 `file://`은 불가, localhost 또는 HTTPS 필요):

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## 핵심 기능

| 기능 | 구현 방식 |
|------|-----------|
| 실시간 포즈 감지 | MediaPipe Pose Landmarker (온디바이스, WASM/GPU) |
| **3D 관절각 측정** | `worldLandmarks`(미터 단위 3D) 기반 — 카메라 시점이 바뀌어도 각도가 거의 불변. 어깨는 몸통 기준 해부학적 평면(관상면/시상면)에 사영해 측정 |
| **동작 자동 인식** | 정의된 운동 11종의 관절각 시그널을 병렬 평가, 진폭 점수로 활성 운동 판별 (학습 모델 불필요) |
| **rep 카운트** | 운동별 진입/복귀 임계각 상태기계(히스테리시스). rep 단위 ROM 기록 |
| 측정 신뢰성 | 세션 min/max 대신 **rep ROM 중앙값** 저장(이상치에 강함) + visibility·지터 기반 **품질 점수**(품질 미달 프레임은 기록 제외) |
| 보상 움직임 감지 | 몸통 기울임·어깨 으쓱 등 감지 시 경고, 보상 비율 집계 |
| 세션 기록 | localStorage(이 기기에만 저장), 회차별 추세 그래프, CSV 내보내기, 규칙 기반 세션 요약 |

## 구조

```
index.html          마크업
css/app.css
js/app.js           진입점 — 카메라·MediaPipe 루프, 프레임 처리, 그리기
js/geometry.js      벡터/각도/필터 순수 수학 (Ema, Median3, JitterMeter, 품질 점수)
js/joints.js        관절 정의 + 3D worldLandmarks 각도 계산 (interior/elevation)
js/exercises.js     운동 11종 정의, rep 상태기계(RepCounter), 자동 인식(AutoDetector)
js/session.js       기록 저장(v1→v2 마이그레이션)·CSV·규칙 기반 요약
js/ui.js            게이지·통계·피드백·기록 렌더링
test/               node:test 단위 테스트 (순수 로직 — 빌드/의존성 불필요)
```

빌드 스텝·백엔드·프레임워크 없음. MediaPipe는 카메라 시작 시 CDN에서 동적 로드.

파이프라인:

```
카메라 프레임
  ↓  MediaPipe Pose (온디바이스)
2D landmarks(그리기·보상 감지) + 3D worldLandmarks(각도 측정)
  ↓  exercises.exSignals — 운동 11종 시그널 병렬 계산
자동 인식(AutoDetector) · 품질 게이트(visibility+지터) · Median3 필터
  ↓
rep 상태기계 → rep ROM → 세션 통계(중앙값) → UI/기록
```

## 테스트

```bash
node --test 'test/*.test.js'
```

각도 수학(시점 불변성 포함), rep 상태기계, 자동 인식, 기록 마이그레이션을
합성 랜드마크 픽스처로 검증한다.

## 설계 배경 — 왜 이 구조인가

초기 계획(React Native + FastAPI + 프레임별 LLM 비전 분석)은 실시간성·비용·정확도
모두에서 비현실적이라 중단됐다. 현재 구조는 그 블로커들을 이렇게 우회한다:

1. **2D 각도 왜곡** → 3D worldLandmarks로 계산해 시점 의존성 제거 (측면 촬영 강제 불필요)
2. **동작 인식** → 오픈월드 인식 대신 정의된 운동 목록 + 임계각 상태기계
3. **개발 부담** → 앱/백엔드 폐기, 정적 웹앱 (GitHub Pages로 바로 배포 가능)
4. **측정 신뢰성** → 의료기기가 아닌 *추세 추적 도구*로 포지셔닝. rep 중앙값·품질 점수·
   보상 감지로 "같은 조건에서 반복 측정한 추세"의 재현성을 확보

## 남은 과제

- [ ] PWA (manifest + 서비스 워커) — 홈화면 설치·오프라인 실행
- [ ] MediaPipe 에셋 로컬 번들 (현재 CDN 의존)
- [ ] 실측 영상 기반 회귀 테스트 (가짜 카메라 주입: `--use-file-for-fake-video-capture`)
- [ ] 고니오미터 대비 정확도 검증 데이터 축적

> ※ 본 도구는 프로토타입이며 의료기기가 아니다. 측정값은 운동 보조·추세 참고용으로만 사용할 것.
