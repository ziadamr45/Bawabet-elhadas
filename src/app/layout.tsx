import type { Metadata } from "next";
import { Noto_Sans_Arabic } from "next/font/google";
import "./globals.css";

const notoArabic = Noto_Sans_Arabic({
  variable: "--font-noto-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "بوابة الحدث - أخبار عربية شاملة",
  description: "منصة أخبار عربية شاملة تجمع الأخبار من مصادر متعددة ومتنوعة باستخدام الذكاء الاصطناعي. تغطية شاملة للسياسة والاقتصاد والرياضة والتكنولوجيا والمزيد.",
  keywords: ["أخبار", "بوابة الحدث", "أخبار عربية", "سياسة", "اقتصاد", "رياضة", "تكنولوجيا"],
  icons: {
    icon: "/favicon-news.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${notoArabic.variable} antialiased bg-background text-foreground font-[family-name:var(--font-noto-arabic)]`}
      >
        {children}
      </body>
    </html>
  );
}
