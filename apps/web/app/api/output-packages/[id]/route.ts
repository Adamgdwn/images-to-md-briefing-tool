import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import { deleteOutputPackage } from "@/lib/store";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const outputPackage = await deleteOutputPackage(id);
  if (!outputPackage) {
    return NextResponse.json({ error: "Output package not found." }, { status: 404 });
  }

  if (outputPackage.storage_path) {
    await fs.unlink(outputPackage.storage_path).catch(() => undefined);
  }

  return NextResponse.json({ deleted: true });
}
