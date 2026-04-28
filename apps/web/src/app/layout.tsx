import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "POS Superpowers",
  description: "POS F&B SaaS"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
