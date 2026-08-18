"use client";

export function AuthPanel() {
  return (
    <section className="auth-panel">
      <div className="auth-heading">
        <p className="eyebrow">계정 연결</p>
        <h2>내 자료를 이어서 사용하세요</h2>
        <p>기여 자료, 크레딧, 학습 기록은 ChatGPT 계정에 안전하게 연결되어 브라우저를 닫아도 유지됩니다.</p>
      </div>
      <div className="auth-options" aria-label="로그인 방법">
        <a className="primary-button" href="/signin-with-chatgpt?return_to=/">ChatGPT로 로그인</a>
        <button type="button" disabled title="이메일 로그인 설정이 아직 연결되지 않았습니다.">이메일로 로그인</button>
        <button type="button" disabled title="Google OAuth 설정이 아직 연결되지 않았습니다.">Google로 로그인</button>
      </div>
      <p className="auth-help">이메일과 Google 로그인은 계정 보안 설정을 마치면 이 위치에서 바로 사용할 수 있습니다.</p>
    </section>
  );
}
