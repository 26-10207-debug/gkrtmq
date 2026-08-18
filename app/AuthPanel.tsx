"use client";

export function AuthPanel() {
  return (
    <section className="auth-panel">
      <div className="auth-heading">
        <p className="eyebrow">계정 연결</p>
        <h2>내 자료를 이어서 사용하세요</h2>
        <p>기여 자료, 크레딧, 학습 기록은 ChatGPT 계정에 안전하게 연결되어 브라우저를 닫아도 유지됩니다.</p>
      </div>
      <a className="primary-button wide" href="/signin-with-chatgpt?return_to=/">
        ChatGPT로 로그인
      </a>
    </section>
  );
}
