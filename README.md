# 🎯 면접 모의연습 시스템

면접 질문에 대한 답변을 녹음하고 AI 피드백을 받을 수 있는 시스템입니다.

## 📋 기능

### 지원자용
- **면접 모의연습**: 설정된 질문에 대해 1분간 답변 녹음
- **실시간 파형 표시**: 녹음 중 음성 파형 시각화
- **AI 피드백**: 답변에 대한 Claude AI의 상세 피드백
- **연습 이력**: 최대 3회 연습 가능, 이력 비교 기능
- **따라하기 연습**: 모범 음성 듣고 따라 말하기 (분석 없음)
- **PDF 리포트**: 분석 결과 다운로드

### 관리자용
- **질문 설정**: 모의연습 질문 설정/변경
- **지원자 현황**: 전체 지원자 연습 진행 상황 모니터링
- **연습 초기화**: 특정 지원자의 연습 횟수 초기화

---

## 🚀 배포 방법 (Vercel)

### 1단계: Vercel 프로젝트 생성

1. [Vercel](https://vercel.com)에 로그인
2. "New Project" 클릭
3. 이 폴더를 GitHub에 푸시하거나, 직접 업로드

### 2단계: Vercel KV 설정

1. Vercel 대시보드에서 프로젝트 선택
2. **Storage** 탭 클릭
3. **Create Database** → **KV** 선택
4. 데이터베이스 이름 입력 (예: `interview-practice-kv`)
5. **Create** 클릭
6. 프로젝트에 자동으로 연결됨

### 3단계: 환경변수 설정

Vercel 프로젝트의 **Settings** → **Environment Variables**에서 다음 변수들을 추가:

```
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-...
CANDIDATES_JSON=[{"id":"A001","pw":"1234"},{"id":"A002","pw":"5678"},{"id":"ADMIN","pw":"0000"}]
```

#### 환경변수 설명

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `ANTHROPIC_API_KEY` | Claude API 키 | `sk-ant-api03-...` |
| `OPENAI_API_KEY` | Whisper API 키 | `sk-...` |
| `CANDIDATES_JSON` | 지원자 명단 (JSON 배열) | 아래 참조 |

#### CANDIDATES_JSON 형식

```json
[
  {"id": "A001", "pw": "1234"},
  {"id": "A002", "pw": "5678"},
  {"id": "A003", "pw": "9012"},
  {"id": "ADMIN", "pw": "0000", "isAdmin": true}
]
```

- `id`: 면접번호 (로그인 ID)
- `pw`: 비밀번호 (4자리 권장)
- `isAdmin`: 관리자 여부 (선택, 또는 id가 "ADMIN"으로 시작하면 자동으로 관리자)

### 4단계: 배포

1. Vercel이 자동으로 배포합니다
2. 배포 완료 후 제공되는 URL로 접속

---

## 💡 사용 방법

### 지원자
1. 면접번호와 비밀번호로 로그인
2. "면접 모의연습" 탭에서 질문 확인
3. 녹음 버튼 클릭 → 1분 내로 답변
4. 녹음 완료 후 "분석 요청" 클릭
5. AI 피드백 확인
6. 최대 3회까지 연습 가능

### 관리자
1. ADMIN 계정으로 로그인
2. "설정" 탭에서 질문 변경 가능
3. "관리자" 탭에서 지원자 현황 모니터링
4. 필요 시 특정 지원자의 연습 기록 초기화

---

## 📁 파일 구조

```
interview-practice/
├── index.html          # 메인 HTML (프론트엔드)
├── vercel.json         # Vercel 배포 설정
├── package.json        # 의존성
├── README.md           # 이 파일
└── api/
    ├── auth.js         # 로그인 인증
    ├── transcribe.js   # 음성→텍스트 (Whisper)
    ├── analyze.js      # AI 분석 (Claude)
    ├── practice.js     # 연습 저장/조회 (Vercel KV)
    └── admin.js        # 관리자 기능
```

---

## ⚠️ 주의사항

1. **API 비용**: Whisper와 Claude API는 유료입니다
   - Whisper: 약 $0.006/분
   - Claude: 약 $0.003/1K 토큰

2. **Vercel KV 무료 한도**: 월 30,000 요청, 256MB
   - 100명 × 3회 = 300건 정도는 충분

3. **녹음 파일**: Base64로 KV에 저장됨 (용량 주의)

4. **브라우저 지원**: Chrome, Edge, Safari 권장 (Firefox는 WebM 이슈 있을 수 있음)

---

## 🔧 로컬 개발

```bash
# 의존성 설치
npm install

# Vercel CLI 설치 (없으면)
npm install -g vercel

# 로컬 실행
vercel dev
```

환경변수는 `.env` 파일에 설정:

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
CANDIDATES_JSON=[{"id":"A001","pw":"1234"},{"id":"ADMIN","pw":"0000"}]
KV_REST_API_URL=https://...
KV_REST_API_TOKEN=...
```

---

## 📞 문의

문제가 있으면 이슈를 등록해주세요.
