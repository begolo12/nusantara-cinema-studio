import { NextRequest, NextResponse } from "next/server";
import { ensureDatabase, getSql } from "@/lib/db";

export async function GET() {
  try {
    await ensureDatabase();
    const sql = getSql();
    const renders = await sql`
      SELECT r.*, p.title AS project_title
      FROM render_jobs r
      JOIN video_projects p ON p.id = r.project_id
      ORDER BY r.created_at DESC
      LIMIT 20
    `;
    return NextResponse.json({ ok: true, renders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load render history";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDatabase();
    const sql = getSql();
    const body = await req.json();
    const inserted = await sql`
      INSERT INTO render_jobs (project_id, engine, aspect_ratio, status, duration_sec)
      VALUES (
        ${Number(body.project_id)},
        ${String(body.engine || "HyperFrames-Canvas-WebM")},
        ${String(body.aspect_ratio || "9:16")},
        ${String(body.status || "completed")},
        ${Number(body.duration_sec || 185)}
      )
      RETURNING *
    `;
    return NextResponse.json({ ok: true, render: inserted[0] }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to log render";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
