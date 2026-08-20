"use client";

import { FormEvent, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

export function AuthPanel() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/providers").then((response) => response.json()).then((data: { google?: boolean }) => setGoogleEnabled(Boolean(data.google))).catch(() => undefined);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const result = mode === "signup"
        ? await authClient.signUp.email({ name, email, password, callbackURL: "/" })
        : await authClient.signIn.email({ email, password, callbackURL: "/" });
      if (result.error) {
        setMessage(result.error.message || "계정 정보를 확인해 주세요.");
        return;
      }
      window.location.assign("/");
    } catch {
      setMessage("로그인 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  async function google() {
    setMessage(null);
    await authClient.signIn.social({ provider: "google", callbackURL: "/" });
  }

  return (
    <section className="auth-panel">
      <div className="auth-heading">
        <p className="eyebrow">계정 연결</p>
        <h2>내 자료를 이어서 사용하세요</h2>
        <p>기여 자료, 크레딧, 학습 기록은 ChatGPT 계정에 안전하게 연결되어 브라우저를 닫아도 유지됩니다.</p>
      </div>
      <div className="auth-options" aria-label="로그인 방법">
        <a className="primary-button" href="/signin-with-chatgpt?return_to=/">ChatGPT로 로그인</a>
        <button type="button" onClick={() => document.getElementById("email-login")?.scrollIntoView({ behavior: "smooth", block: "center" })}>이메일로 로그인</button>
        <button type="button" onClick={() => void google()} disabled={!googleEnabled} title={googleEnabled ? "Google 계정으로 로그인" : "Google OAuth 설정이 아직 연결되지 않았습니다."}>Google로 로그인</button>
      </div>
      <form id="email-login" className="auth-form" onSubmit={submit}>
        {mode === "signup" && <label><span>이름</span><input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" /></label>}
        <label><span>이메일</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>
        <label><span>비밀번호</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required autoComplete={mode === "signin" ? "current-password" : "new-password"} /></label>
        <button className="primary-button wide" type="submit" disabled={submitting}>{submitting ? "처리 중…" : mode === "signin" ? "이메일 로그인" : "이메일 계정 만들기"}</button>
      </form>
      {message && <p className="auth-message">{message}</p>}
      <button className="auth-mode" type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(null); }}>{mode === "signin" ? "처음이신가요? 이메일 계정 만들기" : "이미 계정이 있나요? 로그인"}</button>
      {!googleEnabled && <p className="auth-help">Google 로그인은 Google Cloud OAuth 설정을 연결하면 바로 활성화됩니다.</p>}
    </section>
  );
}

export function SignOutButton({ authMethod }: { authMethod: "chatgpt" | "app" }) {
  async function signOut() {
    if (authMethod === "chatgpt") {
      window.location.assign("/signout-with-chatgpt?return_to=/");
      return;
    }
    await authClient.signOut();
    window.location.assign("/");
  }
  return <button className="secondary-button" type="button" onClick={() => void signOut()}>로그아웃</button>;
}
