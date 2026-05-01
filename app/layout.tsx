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
      <head>
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%237C3AED'/><text x='16' y='22' text-anchor='middle' font-size='18' font-weight='700' font-family='system-ui' fill='white'>E</text></svg>"
        />
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} font-geist antialiased bg-black text-text-1`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
