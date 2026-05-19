import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import { requireApiAuth, storeOwnerId } from "@/lib/auth";
import { getArtifactDetail } from "@/lib/store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiAuth(request);
  if ("response" in authResult) {
    return authResult.response;
  }
  const { id } = await params;
  const detail = await getArtifactDetail(id, storeOwnerId(authResult.auth));
  if (!detail) {
    return NextResponse.json({ error: "Artifact not found." }, { status: 404 });
  }
  const data = await fs.readFile(detail.artifact.image_path);
  return new Response(data, {
    headers: {
      "content-type": contentType(detail.artifact.image_path),
      "cache-control": "private, max-age=60"
    }
  });
}

function contentType(filename: string): string {
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (filename.endsWith(".webp")) {
    return "image/webp";
  }
  return "image/png";
}
