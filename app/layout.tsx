import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enclav",
  description:
    "Your code. Your agent. Your chain. Built on 0G and OpenClaw.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} font-geist antialiased bg-black text-text-1`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
