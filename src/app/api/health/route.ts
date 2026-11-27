import { NextResponse } from "next/server";
import { ensureDatabase, getSql } from "@/lib/db";

export async function GET() {
  try {
    await ensureDatabase();
    const sql = getSql();
    const rows = await sql`SELECT NOW() AS now`;
    return NextResponse.json({
      ok: true,
      db: "neon-postgres",
      serverTime: rows[0]?.now ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database connection error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
