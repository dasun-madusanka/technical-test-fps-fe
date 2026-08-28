import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arena Clone",
  description: "A browser-based arena shooter",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}