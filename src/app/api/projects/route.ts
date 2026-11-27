import { NextRequest, NextResponse } from "next/server";
import { ensureDatabase, getSql } from "@/lib/db";

export async function GET() {
  try {
    await ensureDatabase();
    const sql = getSql();
    const projects = await sql`
      SELECT p.*,
        (SELECT COUNT(*)::int FROM video_scenes s WHERE s.project_id = p.id) AS scene_count
      FROM video_projects p
      ORDER BY p.id ASC
    `;
    const renders = await sql`
      SELECT r.*, p.title AS project_title
      FROM render_jobs r
      JOIN video_projects p ON p.id = r.project_id
      ORDER BY r.created_at DESC
      LIMIT 10
    `;
    return NextResponse.json({ ok: true, projects, renders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch projects";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDatabase();
    const sql = getSql();
    const body = await req.json();
    const title = String(body.title || "Dokumenter Baru").trim();
    const topic = String(body.topic || title).trim();
    const aspectRatio = body.aspect_ratio === "16:9" ? "16:9" : "9:16";
    const visualMode = body.visual_mode === "mooi-indie" ? "mooi-indie" : "blender-3d";
    const chapters = Math.min(8, Math.max(3, Number(body.chapters || 4)));

    const slugBase = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
    const slug = `${slugBase}-${Date.now().toString(36)}`;
    const perScene = 20;
    const totalDuration = chapters * perScene;

    const inserted = await sql`
      INSERT INTO video_projects (slug, title, topic, aspect_ratio, visual_mode, total_duration)
      VALUES (${slug}, ${title}, ${topic}, ${aspectRatio}, ${visualMode}, ${totalDuration})
      RETURNING *
    `;
    const project = inserted[0];

    const romans = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
    for (let i = 0; i < chapters; i++) {
      const idx = i + 1;
      const cues = [
        { start: 0.8, end: 9.5, text: `${title} — Bagian ${romans[i]}\nMenelusuri jejak penting ${topic}.` },
        { start: 9.8, end: 18.5, text: `Babak ${idx} dari ${chapters}: perspektif sinematik\ndan refleksi mendalam untuk generasi masa depan.` },
      ];
      await sql`
        INSERT INTO video_scenes (
          project_id, chapter_index, chapter_label, title, narration_script,
          subtitle_cues, duration_sec, camera_preset, video_url, image_url, audio_url, playback_rate
        ) VALUES (
          ${project.id},
          ${idx},
          ${`BAB ${romans[i]} · ${topic.slice(0, 18).toUpperCase()}`},
          ${i === 0 ? title : `${topic} — Bab ${romans[i]}`},
          ${cues.map((c) => c.text.replace(/\n/g, " ")).join(" ")},
          ${JSON.stringify(cues)}::jsonb,
          ${perScene},
          ${"Cinematic Blender 3D Camera"},
          ${`/media/blender/scene-0${idx}.mp4`},
          ${`/media/art/scene-0${idx}-${["nusantara","kerajaan","kolonial","kebangkitan","proklamasi","reformasi","modern","outro"][i]}.jpg`},
          ${`/media/audio/narration-0${idx}.mp3`},
          ${0.25}
        )
      `;
    }

    return NextResponse.json({ ok: true, project }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create project";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
