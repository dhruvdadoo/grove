import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  if (!name) return new NextResponse("Missing name", { status: 400 });

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return new NextResponse("API key not configured", { status: 500 });

  // Validate format: places/<id>/photos/<id> — prevent path traversal
  if (!/^places\/[A-Za-z0-9_:-]+\/photos\/[A-Za-z0-9_-]+$/.test(name)) {
    return new NextResponse("Invalid photo name", { status: 400 });
  }

  try {
    const url = `https://places.googleapis.com/v1/${name}/media?maxWidthPx=600&key=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });

    if (!res.ok) {
      return new NextResponse("Photo not found", { status: 404 });
    }

    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":  res.headers.get("Content-Type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new NextResponse("Failed to fetch photo", { status: 500 });
  }
}
