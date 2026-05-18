import { NextResponse } from "next/server";
import { outputContentType, outputExtension } from "@/lib/outputExport";
import { getOutputPackage } from "@/lib/store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const outputPackage = await getOutputPackage(id);
  if (!outputPackage) {
    return NextResponse.json({ error: "Output package not found." }, { status: 404 });
  }

  const extension = outputExtension(outputPackage.output_json);
  const filename = `${safeName(outputPackage.package_type)}-${outputPackage.id.slice(0, 8)}.${extension}`;
  return new NextResponse(outputPackage.output_markdown, {
    headers: {
      "content-type": outputContentType(extension),
      "content-disposition": `attachment; filename="${filename}"`
    }
  });
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}
