import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "학습 DB — 능동 회상과 예시 중심 학습",
  description:
    "AI가 구조화한 학습 자료를 정보, 예시, 능동 회상 방식으로 학습하는 기여형 지식 플랫폼입니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
