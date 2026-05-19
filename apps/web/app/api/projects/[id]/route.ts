import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth, storeOwnerId } from "@/lib/auth";
import { deleteProject, getProjectBundle, updateProject } from "@/lib/store";

const projectPatchSchema = z.object({
  name: z.string().min(1).optional(),
  client_context: z.string().optional(),
  status: z.enum(["active", "archived"]).optional()
});

const projectDeleteSchema = z.object({
  confirm_name: z.string().min(1)
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiAuth(request);
  if ("response" in authResult) {
    return authResult.response;
  }
  const { id } = await params;
  const bundle = await getProjectBundle(id, storeOwnerId(authResult.auth));
  if (!bundle) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  return NextResponse.json(bundle);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiAuth(request);
  if ("response" in authResult) {
    return authResult.response;
  }
  const { id } = await params;
  const parsed = projectPatchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const project = await updateProject({ id, ...parsed.data, ownerId: storeOwnerId(authResult.auth) });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  return NextResponse.json({ project });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiAuth(request);
  if ("response" in authResult) {
    return authResult.response;
  }
  const { id } = await params;
  const parsed = projectDeleteSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Type the project name to confirm deletion." }, { status: 400 });
  }
  const bundle = await getProjectBundle(id, storeOwnerId(authResult.auth));
  if (!bundle) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  if (parsed.data.confirm_name !== bundle.project.name) {
    return NextResponse.json({ error: "Project name confirmation did not match." }, { status: 400 });
  }
  const result = await deleteProject(id, storeOwnerId(authResult.auth));
  return NextResponse.json({ deleted: true, result });
}
