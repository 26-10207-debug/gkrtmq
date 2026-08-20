# 학습 DB MVP

사용자가 기여한 자료를 비공개로 보관하고, AI가 개념·예시·반례·오개념·능동 회상 질문으로 구조화한 뒤 검수된 학습 객체만 공개하는 학습 플랫폼입니다.

## 구현 범위

- 물리학 자료 검색과 필터
- 자료 상세 화면
- 정보만 보기
- 예시로 학습하기
- 능동 회상과 자기 평가
- AI 없는 규칙 기반 학습 코스
- 선택적 AI 맞춤 코스
- R2 원본 업로드와 D1 처리 상태 저장
- OpenAI Responses API 기반 필수 자료 구조화
- 학습 진행 상태 저장

AI 키가 없으면 업로드 자료는 `awaiting_ai` 상태로 보관되며 게시되지 않습니다. `OPENAI_API_KEY`가 연결되면 자료는 `gpt-5.6-terra`로 구조화되고 검수 대기 상태가 됩니다.

## 로컬 실행

```bash
pnpm install
pnpm dev
```

OpenAI 기능을 시험하려면 `.env`에 `OPENAI_API_KEY`를 설정하세요.

## 외부 로그인

공개 서비스에서는 이메일·비밀번호 로그인을 사용할 수 있습니다. 배포 환경에는 고정된 인증 비밀값과 실제 서비스 URL을 설정해야 합니다.

```env
BETTER_AUTH_SECRET=충분히-길고-무작위인-비밀값
BETTER_AUTH_URL=https://learning-db-physics.loyal-skink-9354.chatgpt.site
```

Google 로그인은 Google Cloud Console에서 OAuth 웹 애플리케이션을 만든 뒤 다음 값을 배포 환경에 설정하면 활성화됩니다.

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Google 승인된 리디렉션 URI는 다음 주소입니다.

```
https://learning-db-physics.loyal-skink-9354.chatgpt.site/api/auth/callback/google
```
