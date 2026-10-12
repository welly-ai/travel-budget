import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "差旅人天預算工具",
  description: "各專案的差旅人天預算：試算、存檔、修訂歷史與匯出",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
