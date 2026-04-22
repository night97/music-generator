import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 音乐生成器",
  description: "使用 MiniMax AI 生成个性化音乐",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
