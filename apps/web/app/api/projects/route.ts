import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth, storeOwnerId } from "@/lib/auth";
import { createProject, listProjects } from "@/lib/store";

const projectSchema = z.object({
  name: z.string().min(1),
  client_context: z.string().optional()
});

export async function GET(request: Request) {
  const authResult = await requireApiAuth(request);
  if ("response" in authResult) {
    return authResult.response;
  }
  return NextResponse.json({ projects: await listProjects(storeOwnerId(authResult.auth)) });
}

export async function POST(request: Request) {
  const authResult = await requireApiAuth(request);
  if ("response" in authResult) {
    return authResult.response;
  }
  const parsed = projectSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const project = await createProject({ ...parsed.data, created_by: authResult.auth.userId });
  return NextResponse.json({ project }, { status: 201 });
}
