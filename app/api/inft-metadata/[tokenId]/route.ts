import { NextResponse } from "next/server";

function buildShieldSvg(tokenId: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a102f"/>
      <stop offset="100%" stop-color="#09060f"/>
    </linearGradient>
    <linearGradient id="shield" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#A78BFA"/>
      <stop offset="100%" stop-color="#7C3AED"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#bg)"/>
  <path d="M400 120 L610 200 L580 470 C560 620 470 700 400 740 C330 700 240 620 220 470 L190 200 Z" fill="url(#shield)" stroke="#EC4899" stroke-width="8"/>
  <path d="M400 255 L510 300 L492 445 C480 530 430 585 400 608 C370 585 320 530 308 445 L290 300 Z" fill="#120a24" stroke="#A78BFA" stroke-width="6"/>
  <text x="400" y="430" font-size="94" text-anchor="middle" font-family="monospace" fill="#F5F3FF">E</text>
  <text x="400" y="690" font-size="28" text-anchor="middle" font-family="monospace" fill="#C4B5FD">Enclav Security Certificate #${tokenId}</text>
</svg>`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tokenId: string }> },
) {
  const { tokenId } = await params;
  const cleanTokenId = tokenId?.trim() || "1";
  const svgBase64 = Buffer.from(buildShieldSvg(cleanTokenId), "utf8").toString("base64");
  const metadata = {
    name: `Enclav Security Certificate #${cleanTokenId}`,
    description: "Verifiable security audit by Enclav on 0G TeeML",
    image: `data:image/svg+xml;base64,${svgBase64}`,
  };
  return NextResponse.json(metadata, {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
