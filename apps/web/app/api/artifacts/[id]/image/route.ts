import { NextResponse } from "next/server";
import { requireApiAuth, storeOwnerId } from "@/lib/auth";
import { contentTypeForFilename, readManagedFile } from "@/lib/fileStorage";
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
  const data = await readManagedFile(detail.artifact.image_path);
  return new Response(data, {
    headers: {
      "content-type": contentTypeForFilename(detail.artifact.image_path),
      "cache-control": "private, max-age=60"
    }
  });
}
