import { NextResponse } from "next/server";
import { requireApiAuth, storeOwnerId } from "@/lib/auth";
import { filenameTimestampFromOutput, outputContentType, outputExtension } from "@/lib/outputExport";
import { getOutputPackage } from "@/lib/store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiAuth(request);
  if ("response" in authResult) {
    return authResult.response;
  }
  const { id } = await params;
  const outputPackage = await getOutputPackage(id, storeOwnerId(authResult.auth));
  if (!outputPackage) {
    return NextResponse.json({ error: "Output package not found." }, { status: 404 });
  }

  const extension = outputExtension(outputPackage.output_json);
  const timestamp = filenameTimestampFromOutput(outputPackage.output_json) ?? outputPackage.created_at.replace(/[:.]/g, "-");
  const filename = `${safeName(outputPackage.package_type)}-${timestamp}-${outputPackage.id.slice(0, 8)}.${extension}`;
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
