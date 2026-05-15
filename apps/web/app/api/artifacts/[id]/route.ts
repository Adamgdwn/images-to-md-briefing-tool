import { NextResponse } from "next/server";
import { getArtifactDetail } from "@/lib/store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getArtifactDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "Artifact not found." }, { status: 404 });
  }
  return NextResponse.json(detail);
}
