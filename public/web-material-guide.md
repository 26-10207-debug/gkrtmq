# 덤캔런 웹 자료 제작 규격

원본은 파일당 20MB, 최대 5개, 합계 32MB까지 보관합니다. 모든 형식을 동일하게 실행하는 것은 아닙니다. HTML·CSS·JavaScript·WebAssembly로 만든 브라우저용 자료를 웹 실행기로 엽니다. EXE·APK와 서버용 코드는 원본 보관·다운로드가 가능합니다.

## 가장 쉬운 구성

- 단일 HTML: CSS와 JavaScript를 HTML 안에 포함합니다.
- ZIP: index.html, CSS, JS, 이미지 등 필요한 파일을 상대 경로로 묶습니다. 압축 해제 후 최대 16MB·256개 항목입니다.
- React 등은 개발 프로젝트 대신 웹용으로 빌드한 결과를 올립니다. 서버 실행, npm 설치, API 키는 제공하지 않습니다.
- CSS·JS와 HTML을 각각 첨부해도 파일명에 맞는 상대 경로로 연결할 수 있습니다. 폴더가 필요하면 ZIP으로 올립니다.

index.html이 하나라면 자동으로 찾습니다. 시작점이 여러 개일 때 ZIP에 dcl.json을 추가하세요. entry는 dcl.json 기준 상대 경로입니다.

```json
{"version": 1, "entry": "lesson.html"}
```

`./app.js`, `./images/diagram.png`처럼 상대 경로를 쓰세요. `/app.js`처럼 사이트 루트 기준 경로는 사용할 수 없습니다. 파일 경로에 `..`, 역슬래시, `?`, `#`, `:`는 사용할 수 없습니다.

## 실행 환경

사용자가 실행 버튼을 눌러야 시작합니다. 실행 URL은 1시간 후 만료되며 다시 실행하면 새로 발급됩니다. iframe sandbox와 CSP로 사이트 계정·쿠키·DOM에서 격리합니다. allow-same-origin, 외부 iframe, 폼 전송, 서버 프로세스는 지원하지 않습니다. 기본 JavaScript, Canvas, Web Audio, 브라우저가 지원하는 WebAssembly를 사용할 수 있습니다. eval을 요구하거나 여러 스레드·특수 서버 헤더를 요구하는 빌드는 조정이 필요합니다.

의존성은 ZIP 안에 포함하는 방식을 권장합니다. 외부 스크립트·모듈은 cdn.jsdelivr.net, esm.sh, unpkg.com에서만 허용하며, 해당 서버의 CORS 지원이 필요합니다. Google Fonts도 허용합니다. 임의 외부 API 호출이나 원격 이미지 로딩은 허용하지 않습니다. 키·비밀번호를 자료에 넣지 마세요. 공개 자료의 코드는 누구나 읽을 수 있습니다.

휴대폰용 viewport 메타 태그를 넣고, 고정 너비 대신 max-width:100%를 사용하세요. 버튼은 손가락으로 누를 수 있게 만들고, 마우스 hover나 키보드만 있어야 진행되는 게임은 피하세요.

## 선택 기능: 개인 학습 기록

실행기는 window.DCL을 제공합니다. 로그인한 사용자의 공개 자료별 기록은 서버에 64KB까지 저장되며, 공개 API와 MCP에는 노출되지 않습니다. 초안 미리보기에서는 현재 실행기 안의 임시 기록으로만 동작합니다. 로그인하지 않았다면 저장 요청이 거절되므로 try/catch로 처리하세요.

```javascript
try {
  const previous = await window.DCL.loadState();
  await window.DCL.saveState({ score: (previous?.score ?? 0) + 1 });
} catch (error) {
  // 로그인 없이도 학습 자체는 계속할 수 있도록 안내합니다.
  console.info(error.message);
}
```

## GPT가 읽기 쉬운 자료

README.md에 학습 목표, 사용법, 출처를 적으세요. 실행 파일만 올리는 경우 GPT가 프로그램의 전체 의미를 읽을 수 있다고 보장할 수 없습니다. 원본 코드와 설명을 함께 넣으면 공개 MCP의 search, fetch, read_file로 내용을 가져올 수 있습니다.

공개 MCP 연결 주소: 이 사이트의 `/api/mcp`입니다. 인증은 없음으로 설정합니다.
