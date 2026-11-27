import { neon } from "@neondatabase/serverless";

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface VideoSceneRow {
  id: number;
  project_id: number;
  chapter_index: number;
  chapter_label: string;
  title: string;
  narration_script: string;
  subtitle_cues: SubtitleCue[];
  duration_sec: number;
  camera_preset: string;
  video_url: string;
  image_url: string;
  audio_url: string;
  playback_rate: number;
}

export interface VideoProjectRow {
  id: number;
  slug: string;
  title: string;
  topic: string;
  aspect_ratio: string;
  visual_mode: string;
  total_duration: number;
  created_at: string;
}

export interface RenderJobRow {
  id: number;
  project_id: number;
  engine: string;
  aspect_ratio: string;
  status: string;
  duration_sec: number;
  created_at: string;
}

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not configured.");
  }
  return neon(url);
}

let schemaReady = false;

export async function ensureDatabase() {
  const sql = getSql();
  if (!schemaReady) {
    await sql`
      CREATE TABLE IF NOT EXISTS video_projects (
        id SERIAL PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        topic TEXT NOT NULL,
        aspect_ratio TEXT NOT NULL DEFAULT '9:16',
        visual_mode TEXT NOT NULL DEFAULT 'blender-3d',
        total_duration INTEGER NOT NULL DEFAULT 185,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS video_scenes (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
        chapter_index INTEGER NOT NULL,
        chapter_label TEXT NOT NULL,
        title TEXT NOT NULL,
        narration_script TEXT NOT NULL,
        subtitle_cues JSONB NOT NULL DEFAULT '[]'::jsonb,
        duration_sec INTEGER NOT NULL,
        camera_preset TEXT NOT NULL,
        video_url TEXT NOT NULL,
        image_url TEXT NOT NULL,
        audio_url TEXT NOT NULL,
        playback_rate REAL NOT NULL DEFAULT 0.22
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS render_jobs (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
        engine TEXT NOT NULL,
        aspect_ratio TEXT NOT NULL,
        status TEXT NOT NULL,
        duration_sec INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    schemaReady = true;
  }
  await seedDefaultProject();
}

const DEFAULT_SCENES = [
  {
    chapter_index: 1,
    chapter_label: "BAB I · NUSANTARA",
    title: "INDONESIA",
    narration_script:
      "Indonesia. Negara kepulauan terbesar di dunia yang membentang di garis khatulistiwa. Lebih dari tujuh belas ribu pulau, seribu tiga ratus suku bangsa, dan tujuh ratus bahasa daerah berpadu dalam satu tanah air.",
    subtitle_cues: [
      { start: 0.8, end: 6.5, text: "Indonesia. Negara kepulauan terbesar di dunia\nyang membentang di garis khatulistiwa." },
      { start: 6.7, end: 13.8, text: "Lebih dari tujuh belas ribu pulau,\nseribu tiga ratus suku, dan tujuh ratus bahasa daerah." },
      { start: 14.0, end: 20.5, text: "Berpadu dalam satu tanah air.\nInilah kisah perjalanan panjang Nusantara." },
    ],
    duration_sec: 22,
    camera_preset: "Aerial Crane-Down + Dolly-In (Blender 3D)",
    video_url: "/media/blender/scene-01.mp4",
    image_url: "/media/art/scene-01-nusantara.jpg",
    audio_url: "/media/audio/narration-01.mp3",
    playback_rate: 0.22,
  },
  {
    chapter_index: 2,
    chapter_label: "BAB II · ABAD IV – XV",
    title: "Kerajaan Maritim Nusantara",
    narration_script:
      "Jauh sebelum Indonesia berdiri, peradaban agung telah tumbuh di kepulauan ini. Dari Kutai dan Tarumanegara, Sriwijaya, Candi Borobudur dan Prambanan, hingga Majapahit.",
    subtitle_cues: [
      { start: 0.8, end: 7.2, text: "Jauh sebelum Indonesia berdiri,\nperadaban agung telah tumbuh di kepulauan ini." },
      { start: 7.4, end: 14.5, text: "Dari Kutai dan Tarumanegara, hingga Sriwijaya\nyang menguasai jalur perdagangan maritim Asia." },
      { start: 14.7, end: 22.0, text: "Candi Borobudur dan Prambanan berdiri megah,\nsementara Majapahit merajut cita-cita Nusantara." },
    ],
    duration_sec: 24,
    camera_preset: "Low-Angle Heroic Orbit + Pedestal-Up (Blender 3D)",
    video_url: "/media/blender/scene-02.mp4",
    image_url: "/media/art/scene-02-kerajaan.jpg",
    audio_url: "/media/audio/narration-02.mp3",
    playback_rate: 0.2,
  },
  {
    chapter_index: 3,
    chapter_label: "BAB III · ABAD XVI – XIX",
    title: "Jalur Rempah & Era Kolonial",
    narration_script:
      "Kekayaan rempah cengkih dan pala dari Maluku menarik penjelajah dunia. Monopoli VOC (1602) dan penjajahan kolonial dihadapi perlawanan heroik di seluruh Nusantara.",
    subtitle_cues: [
      { start: 0.8, end: 6.9, text: "Kekayaan rempah cengkih dan pala dari Maluku\nmenarik para penjelajah dunia." },
      { start: 7.1, end: 14.0, text: "Kesultanan Nusantara tumbuh pesat sebelum\nmonopoli VOC (1602) dan penjajahan kolonial." },
      { start: 14.2, end: 21.3, text: "Namun perlawanan tak pernah padam — dari Pattimura,\nDiponegoro, Imam Bonjol, hingga Cut Nyak Dien." },
    ],
    duration_sec: 23,
    camera_preset: "Ocean-Level Tracking Dolly (Blender 3D)",
    video_url: "/media/blender/scene-03.mp4",
    image_url: "/media/art/scene-03-kolonial.jpg",
    audio_url: "/media/audio/narration-03.mp3",
    playback_rate: 0.21,
  },
  {
    chapter_index: 4,
    chapter_label: "BAB IV · 1908 – 1928",
    title: "Sumpah Pemuda",
    narration_script:
      "Memasuki abad kedua puluh, perjuangan bersenjata bertransformasi menjadi pergerakan nasional dari Budi Utomo hingga Sumpah Pemuda 28 Oktober 1928.",
    subtitle_cues: [
      { start: 0.8, end: 7.2, text: "Memasuki abad ke-20, perjuangan bersenjata\nbertransformasi menjadi pergerakan nasional." },
      { start: 7.4, end: 15.5, text: "Dari Budi Utomo (1908) hingga puncak kesadaran\npada 28 Oktober 1928 di Kongres Pemuda II." },
      { start: 15.7, end: 24.1, text: "Satu Tanah Air, Satu Bangsa,\ndan Satu Bahasa Persatuan: Indonesia." },
    ],
    duration_sec: 26,
    camera_preset: "Intimate 3D Museum Dolly Push-In (Blender Diorama)",
    video_url: "/media/blender/scene-04.mp4",
    image_url: "/media/art/scene-04-kebangkitan.jpg",
    audio_url: "/media/audio/narration-04.mp3",
    playback_rate: 0.19,
  },
  {
    chapter_index: 5,
    chapter_label: "BAB V · 17 AGUSTUS 1945",
    title: "Proklamasi Kemerdekaan",
    narration_script:
      "17 Agustus 1945 Soekarno dan Mohammad Hatta membacakan Proklamasi Kemerdekaan Indonesia, disusul pengesahan Pancasila dan UUD 1945.",
    subtitle_cues: [
      { start: 0.8, end: 7.7, text: "17 Agustus 1945 — Soekarno dan Mohammad Hatta\nmembacakan Proklamasi Kemerdekaan Indonesia." },
      { start: 7.9, end: 15.0, text: "Pancasila dan UUD 1945 disahkan\nsebagai dasar negara Republik Indonesia." },
      { start: 15.2, end: 22.1, text: "Diikuti perjuangan mempertahankan kedaulatan\nhingga pengakuan penuh pada tahun 1949." },
    ],
    duration_sec: 24,
    camera_preset: "Crane-Up + Waving 3D Merah Putih Flag (Blender Diorama)",
    video_url: "/media/blender/scene-05.mp4",
    image_url: "/media/art/scene-05-proklamasi.jpg",
    audio_url: "/media/audio/narration-05.mp3",
    playback_rate: 0.21,
  },
  {
    chapter_index: 6,
    chapter_label: "BAB VI · 1950 – 1998",
    title: "Membangun Bangsa",
    narration_script:
      "Indonesia menapaki panggung diplomasi dunia lewat Konferensi Asia-Afrika Bandung 1955, pembangunan nasional, hingga Reformasi 1998.",
    subtitle_cues: [
      { start: 0.8, end: 7.5, text: "Indonesia menapaki panggung diplomasi dunia\nlewat Konferensi Asia-Afrika Bandung 1955." },
      { start: 7.7, end: 14.6, text: "Dekade pembangunan infrastruktur berjalan\nhingga lahirnya Reformasi pada tahun 1998." },
      { start: 14.8, end: 21.5, text: "Membuka era demokrasi langsung,\nkebebasan pers, dan otonomi daerah." },
    ],
    duration_sec: 23,
    camera_preset: "Lateral Architectural Tracking (Blender Diorama)",
    video_url: "/media/blender/scene-06.mp4",
    image_url: "/media/art/scene-06-reformasi.jpg",
    audio_url: "/media/audio/narration-06.mp3",
    playback_rate: 0.22,
  },
  {
    chapter_index: 7,
    chapter_label: "BAB VII · ABAD XXI",
    title: "Indonesia Masa Kini",
    narration_script:
      "Kini Indonesia menjadi demokrasi terbesar ketiga di dunia, ekonomi terbesar ASEAN dan anggota G20, serta kaya warisan budaya UNESCO.",
    subtitle_cues: [
      { start: 0.8, end: 7.7, text: "Demokrasi terbesar ketiga di dunia sekaligus\nekonomi terbesar ASEAN dan anggota G20." },
      { start: 7.9, end: 14.8, text: "Batik, Wayang, Angklung, dan Gamelan\ndiakui sebagai warisan budaya dunia UNESCO." },
      { start: 15.0, end: 21.9, text: "Generasi muda mendorong transformasi digital,\nekonomi kreatif, dan pembangunan berkelanjutan." },
    ],
    duration_sec: 24,
    camera_preset: "Drone Flyover + Tilt-Up Jakarta 3D (Blender 3D)",
    video_url: "/media/blender/scene-07.mp4",
    image_url: "/media/art/scene-07-modern.jpg",
    audio_url: "/media/audio/narration-07.mp3",
    playback_rate: 0.21,
  },
  {
    chapter_index: 8,
    chapter_label: "INDONESIA EMAS 2045",
    title: "Bhinneka Tunggal Ika",
    narration_script:
      "Dari kerajaan maritim kuno hingga republik modern, kekuatan Indonesia selalu terletak pada persatuannya. Bhinneka Tunggal Ika menatap Indonesia Emas 2045.",
    subtitle_cues: [
      { start: 0.8, end: 8.2, text: "Dari kerajaan maritim kuno hingga republik modern,\nkekuatan Indonesia selalu terletak pada persatuannya." },
      { start: 8.4, end: 17.0, text: "Bersama menjaga warisan sejarah,\nmenatap Indonesia Emas 2045." },
    ],
    duration_sec: 19,
    camera_preset: "Grand Ascending Crane-Out Sunrise (Blender 3D)",
    video_url: "/media/blender/scene-08.mp4",
    image_url: "/media/art/scene-08-outro.jpg",
    audio_url: "/media/audio/narration-08.mp3",
    playback_rate: 0.26,
  },
];

export async function seedDefaultProject() {
  const sql = getSql();
  const existing = await sql`SELECT id FROM video_projects LIMIT 1`;
  if (existing.length > 0) return;

  const inserted = await sql`
    INSERT INTO video_projects (slug, title, topic, aspect_ratio, visual_mode, total_duration)
    VALUES (
      'sejarah-indonesia',
      'Sejarah Indonesia: Dari Nusantara Menuju Masa Depan',
      'Sejarah & Identitas Indonesia (8 Bab Sinematik)',
      '9:16',
      'blender-3d',
      185
    )
    RETURNING id
  `;
  const projectId = inserted[0].id as number;

  for (const s of DEFAULT_SCENES) {
    await sql`
      INSERT INTO video_scenes (
        project_id, chapter_index, chapter_label, title, narration_script,
        subtitle_cues, duration_sec, camera_preset, video_url, image_url, audio_url, playback_rate
      ) VALUES (
        ${projectId}, ${s.chapter_index}, ${s.chapter_label}, ${s.title}, ${s.narration_script},
        ${JSON.stringify(s.subtitle_cues)}::jsonb, ${s.duration_sec}, ${s.camera_preset},
        ${s.video_url}, ${s.image_url}, ${s.audio_url}, ${s.playback_rate}
      )
    `;
  }
}
