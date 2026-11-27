import { NextRequest, NextResponse } from "next/server";
import { ensureDatabase, getSql, VideoSceneRow } from "@/lib/db";

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabase();
    const { id } = await context.params;
    const projectId = Number(id);
    const sql = getSql();
    const projects = await sql`SELECT * FROM video_projects WHERE id = ${projectId}`;
    if (projects.length === 0) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const project = projects[0];
    const scenes = (await sql`
      SELECT * FROM video_scenes WHERE project_id = ${projectId} ORDER BY chapter_index ASC
    `) as VideoSceneRow[];

    const w = project.aspect_ratio === "16:9" ? 1920 : 1080;
    const h = project.aspect_ratio === "16:9" ? 1080 : 1920;

    let cursor = 0;
    const hostTags = scenes
      .map((s) => {
        const tag = `      <div id="scene-${s.chapter_index}" data-composition-id="scene-${s.chapter_index}" data-composition-src="compositions/scene-0${s.chapter_index}.html" data-start="${cursor}" data-duration="${s.duration_sec}" data-track-index="0" data-track-kind="graphics" data-width="${w}" data-height="${h}"></div>`;
        cursor += s.duration_sec;
        return tag;
      })
      .join("\n");

    const bundle = {
      hyperframesVersion: "0.9.102",
      project,
      indexHtml: `<!doctype html>\n<html lang="id"><head><meta charset="UTF-8"/><script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="${cursor}" data-width="${w}" data-height="${h}">\n${hostTags}\n</div><script>window.__timelines=window.__timelines||{};window.__timelines["main"]=gsap.timeline({paused:true});</script></body></html>`,
      scenes,
    };

    return new NextResponse(JSON.stringify(bundle, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${project.slug}-hyperframes.json"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
