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
  return NextResponse.json(detail);
}
