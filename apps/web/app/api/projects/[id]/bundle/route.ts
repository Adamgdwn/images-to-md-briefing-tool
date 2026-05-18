import { NextResponse } from "next/server";
import { createProjectBackupBundle } from "@/lib/store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await createProjectBackupBundle(id);
  if (!bundle) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const timestamp = bundle.exported_at.replace(/[:.]/g, "-");
  const filename = `${safeName(bundle.project.name)}-${timestamp}.project-backup.json`;
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${filename}"`
    }
  });
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}
