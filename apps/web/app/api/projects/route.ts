import { NextResponse } from "next/server";
import { z } from "zod";
import { createProject, listProjects } from "@/lib/store";

const projectSchema = z.object({
  name: z.string().min(1),
  client_context: z.string().optional()
});

export async function GET() {
  return NextResponse.json({ projects: await listProjects() });
}

export async function POST(request: Request) {
  const parsed = projectSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const project = await createProject(parsed.data);
  return NextResponse.json({ project }, { status: 201 });
}
