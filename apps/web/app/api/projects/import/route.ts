import { NextResponse } from "next/server";
import { importProjectBackupBundle } from "@/lib/store";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Project backup file is required." }, { status: 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(await file.arrayBuffer()).toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Project backup must be valid JSON." }, { status: 400 });
  }

  try {
    const result = await importProjectBackupBundle(parsed);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Project backup could not be imported." }, { status: 400 });
  }
}
