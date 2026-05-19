import { NextResponse } from "next/server";
import { requireApiAuth, storeOwnerId } from "@/lib/auth";
import { deleteManagedFile } from "@/lib/fileStorage";
import { deleteOutputPackage } from "@/lib/store";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiAuth(request);
  if ("response" in authResult) {
    return authResult.response;
  }
  const { id } = await params;
  const outputPackage = await deleteOutputPackage(id, storeOwnerId(authResult.auth));
  if (!outputPackage) {
    return NextResponse.json({ error: "Output package not found." }, { status: 404 });
  }

  if (outputPackage.storage_path) {
    await deleteManagedFile(outputPackage.storage_path);
  }

  return NextResponse.json({ deleted: true });
}
