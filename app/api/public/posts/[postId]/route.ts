import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET() {
  return NextResponse.json(
    {
      error: "Public post previews are temporarily unavailable.",
    },
    {
      status: 404,
      headers: noStoreHeaders,
    },
  );
}