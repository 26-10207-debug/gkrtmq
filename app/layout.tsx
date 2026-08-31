import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dumb Can Learn — 능동 회상과 예시 중심 학습",
  description:
    "Dumb Can Learn에서 자료를 찾고, 예시와 능동 회상으로 깊이 이해하세요.",
  openGraph: {
    title: "Dumb Can Learn",
    description: "Learn with what you know.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Dumb Can Learn",
    description: "Learn with what you know.",
    images: ["/og.png"],
  },
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
