import { NextRequest, NextResponse } from "next/server";
import { ensureDatabase, getSql } from "@/lib/db";

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabase();
    const { id } = await context.params;
    const projectId = Number(id);
    const sql = getSql();

    const projects = await sql`SELECT * FROM video_projects WHERE id = ${projectId}`;
    if (projects.length === 0) {
      return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
    }
    const scenes = await sql`
      SELECT * FROM video_scenes WHERE project_id = ${projectId} ORDER BY chapter_index ASC
    `;
    const renders = await sql`
      SELECT * FROM render_jobs WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 10
    `;
    return NextResponse.json({ ok: true, project: projects[0], scenes, renders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch project";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabase();
    const { id } = await context.params;
    const projectId = Number(id);
    const body = await req.json();
    const sql = getSql();

    if (body.aspect_ratio || body.visual_mode || body.title) {
      await sql`
        UPDATE video_projects
        SET
          aspect_ratio = COALESCE(${body.aspect_ratio ?? null}, aspect_ratio),
          visual_mode = COALESCE(${body.visual_mode ?? null}, visual_mode),
          title = COALESCE(${body.title ?? null}, title)
        WHERE id = ${projectId}
      `;
    }

    if (body.scene && body.scene.id) {
      const s = body.scene;
      await sql`
        UPDATE video_scenes
        SET
          chapter_label = COALESCE(${s.chapter_label ?? null}, chapter_label),
          title = COALESCE(${s.title ?? null}, title),
          duration_sec = COALESCE(${s.duration_sec ?? null}, duration_sec),
          subtitle_cues = COALESCE(${s.subtitle_cues ? JSON.stringify(s.subtitle_cues) : null}::jsonb, subtitle_cues)
        WHERE id = ${Number(s.id)} AND project_id = ${projectId}
      `;
      const sumRows = await sql`
        SELECT COALESCE(SUM(duration_sec), 0)::int AS total FROM video_scenes WHERE project_id = ${projectId}
      `;
      await sql`
        UPDATE video_projects SET total_duration = ${sumRows[0].total} WHERE id = ${projectId}
      `;
    }

    const projects = await sql`SELECT * FROM video_projects WHERE id = ${projectId}`;
    const scenes = await sql`SELECT * FROM video_scenes WHERE project_id = ${projectId} ORDER BY chapter_index ASC`;
    return NextResponse.json({ ok: true, project: projects[0], scenes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update project";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
