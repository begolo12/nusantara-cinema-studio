"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Database,
  Download,
  Film,
  Layers,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Video,
} from "lucide-react";

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

interface Scene {
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

interface Project {
  id: number;
  slug: string;
  title: string;
  topic: string;
  aspect_ratio: string;
  visual_mode: string;
  total_duration: number;
  scene_count?: number;
}

interface RenderJob {
  id: number;
  project_id: number;
  project_title?: string;
  engine: string;
  aspect_ratio: string;
  status: string;
  duration_sec: number;
  created_at: string;
}

export default function CinemaStudio() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [renders, setRenders] = useState<RenderJob[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [dbStatus, setDbStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [dbError, setDbError] = useState<string | null>(null);

  // Playback & Render Engine state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [playAllMode, setPlayAllMode] = useState(true);
  const [sceneTime, setSceneTime] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [newChapters, setNewChapters] = useState(4);

  // Editable fields for selected scene
  const [editLabel, setEditLabel] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDuration, setEditDuration] = useState(22);
  const [editSubtitles, setEditSubtitles] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const imgElRef = useRef<HTMLImageElement | null>(null);
  const voAudioRef = useRef<HTMLAudioElement | null>(null);
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const activeScene = scenes[selectedIdx] ?? null;

  const loadProjectDetail = useCallback(async (projectId: number) => {
    const res = await fetch(`/api/projects/${projectId}`);
    const data = await res.json();
    if (data.ok) {
      setActiveProject(data.project);
      setScenes(data.scenes || []);
      setRenders(data.renders || []);
      setSelectedIdx(0);
      setSceneTime(0);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      setDbStatus("connecting");
      const res = await fetch("/api/projects");
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Neon DB error");
      setDbStatus("connected");
      setProjects(data.projects || []);
      setRenders(data.renders || []);
      if (data.projects?.length > 0) {
        await loadProjectDetail(data.projects[0].id);
      }
    } catch (e) {
      setDbStatus("error");
      setDbError(e instanceof Error ? e.message : "Failed to connect to Neon Postgres");
    }
  }, [loadProjectDetail]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Sync editor inputs when active scene changes
  useEffect(() => {
    if (!activeScene) return;
    setEditLabel(activeScene.chapter_label);
    setEditTitle(activeScene.title);
    setEditDuration(activeScene.duration_sec);
    setEditSubtitles(
      (activeScene.subtitle_cues || [])
        .map((c) => `${c.start}-${c.end}|${c.text.replace(/\n/g, " / ")}`)
        .join("\n")
    );
  }, [activeScene]);

  const canvasDims = useMemo(() => {
    if (activeProject?.aspect_ratio === "16:9") {
      return { w: 1280, h: 720 };
    }
    return { w: 720, h: 1280 };
  }, [activeProject?.aspect_ratio]);

  // Load media element whenever activeScene or visual_mode changes
  useEffect(() => {
    if (!activeScene || !activeProject) return;

    if (!videoElRef.current) {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.crossOrigin = "anonymous";
      v.preload = "auto";
      videoElRef.current = v;
    }
    const v = videoElRef.current;
    v.src = activeScene.video_url;
    v.playbackRate = Math.max(0.15, Math.min(2.0, activeScene.playback_rate || 0.22));
    v.load();

    if (!imgElRef.current) {
      const im = new Image();
      im.crossOrigin = "anonymous";
      imgElRef.current = im;
    }
    imgElRef.current.src = activeScene.image_url;

    if (voAudioRef.current) {
      voAudioRef.current.src = activeScene.audio_url;
      voAudioRef.current.load();
    }
  }, [activeScene, activeProject]);

  // Draw a single cinema frame to <canvas>
  const drawFrame = useCallback(
    (t: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !activeScene || !activeProject) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const dur = Math.max(4, activeScene.duration_sec);

      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, W, H);

      // 1. Background plate (Blender 3D Video OR Mooi Indie Ken Burns)
      const useBlender = activeProject.visual_mode === "blender-3d";
      const v = videoElRef.current;
      const im = imgElRef.current;

      if (useBlender && v && v.readyState >= 2) {
        const vw = v.videoWidth || 1080;
        const vh = v.videoHeight || 1920;
        const scale = Math.max(W / vw, H / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
      } else if (im && im.complete && im.naturalWidth > 0) {
        const progress = Math.min(1, t / dur);
        const kenScale = 1.0 + progress * 0.08;
        const baseScale = Math.max(W / im.naturalWidth, H / im.naturalHeight) * kenScale;
        const dw = im.naturalWidth * baseScale;
        const dh = im.naturalHeight * baseScale;
        const panY = -progress * 18;
        ctx.drawImage(im, (W - dw) / 2, (H - dh) / 2 + panY, dw, dh);
      }

      // 2. Theatrical letterbox vignette
      const topGrad = ctx.createLinearGradient(0, 0, 0, H * 0.28);
      topGrad.addColorStop(0, "rgba(0,0,0,0.75)");
      topGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = topGrad;
      ctx.fillRect(0, 0, W, H * 0.28);

      const botGrad = ctx.createLinearGradient(0, H * 0.62, 0, H);
      botGrad.addColorStop(0, "rgba(0,0,0,0)");
      botGrad.addColorStop(1, "rgba(0,0,0,0.92)");
      ctx.fillStyle = botGrad;
      ctx.fillRect(0, H * 0.62, W, H * 0.38);

      // 3. Fading Movie Chapter Title Card (0.6s -> 5.6s; outro stays)
      const isOutro = activeScene.chapter_index === scenes.length;
      let titleAlpha = 0;
      if (t >= 0.6 && t <= 1.5) titleAlpha = (t - 0.6) / 0.9;
      else if (t > 1.5 && (isOutro || t < 4.7)) titleAlpha = 1;
      else if (!isOutro && t >= 4.7 && t <= 5.6) titleAlpha = Math.max(0, 1 - (t - 4.7) / 0.9);

      if (titleAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = titleAlpha;
        ctx.textAlign = "center";
        ctx.shadowColor = "rgba(0,0,0,0.92)";
        ctx.shadowBlur = 18;

        ctx.fillStyle = "#D4A359";
        ctx.font = `700 ${Math.round(W * 0.022)}px "Space Mono", monospace`;
        ctx.fillText(activeScene.chapter_label, W / 2, H * 0.36);

        ctx.fillStyle = "#F4EFE6";
        ctx.font = `700 ${Math.round(W * 0.068)}px "Playfair Display", Georgia, serif`;
        const words = activeScene.title.split(" ");
        if (words.length > 2 && activeProject.aspect_ratio === "9:16") {
          const mid = Math.ceil(words.length / 2);
          ctx.fillText(words.slice(0, mid).join(" "), W / 2, H * 0.42);
          ctx.fillText(words.slice(mid).join(" "), W / 2, H * 0.48);
        } else {
          ctx.fillText(activeScene.title, W / 2, H * 0.43);
        }
        ctx.restore();
      }

      // 4. Movie-Style Timed Indonesian Cinema Subtitles (no box)
      const activeCue = (activeScene.subtitle_cues || []).find((c) => t >= c.start && t <= c.end);
      if (activeCue) {
        ctx.save();
        ctx.textAlign = "center";
        ctx.fillStyle = "#F4EFE6";
        ctx.font = `500 ${Math.round(W * 0.032)}px "Inter", sans-serif`;
        ctx.shadowColor = "rgba(0,0,0,0.98)";
        ctx.shadowBlur = 12;
        const lines = activeCue.text.split("\n");
        const baseY = H * 0.87;
        lines.forEach((line, idx) => {
          ctx.fillText(line, W / 2, baseY + idx * Math.round(W * 0.044));
        });
        ctx.restore();
      }

      // 5. Dip-to-Black Cinema Curtain
      let curtainAlpha = 0;
      if (t < 0.7) curtainAlpha = 1 - t / 0.7;
      else if (t > dur - 0.8) curtainAlpha = Math.min(1, (t - (dur - 0.8)) / 0.8);
      if (curtainAlpha > 0.01) {
        ctx.fillStyle = `rgba(0,0,0,${curtainAlpha.toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }
    },
    [activeScene, activeProject, scenes.length]
  );

  // Redraw when scrubbing or changing scene
  useEffect(() => {
    drawFrame(sceneTime);
  }, [sceneTime, drawFrame]);

  // Animation loop while playing
  useEffect(() => {
    if (!isPlaying || !activeScene) return;

    const v = videoElRef.current;
    if (v) {
      v.currentTime = Math.min(4.8, (sceneTime * (activeScene.playback_rate || 0.22)) % 5);
      v.play().catch(() => {});
    }
    if (voAudioRef.current && sceneTime < activeScene.duration_sec - 1) {
      voAudioRef.current.currentTime = Math.max(0, sceneTime - 0.8);
      voAudioRef.current.play().catch(() => {});
    }
    if (bgmAudioRef.current) {
      bgmAudioRef.current.volume = 0.16;
      bgmAudioRef.current.play().catch(() => {});
    }

    lastTickRef.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      setSceneTime((prev) => {
        const next = prev + dt;
        if (next >= activeScene.duration_sec) {
          if (playAllMode && selectedIdx + 1 < scenes.length) {
            setSelectedIdx((i) => i + 1);
            return 0;
          } else {
            setIsPlaying(false);
            if (isRecording && recorderRef.current && recorderRef.current.state === "recording") {
              recorderRef.current.stop();
            }
            return activeScene.duration_sec;
          }
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      v?.pause();
      voAudioRef.current?.pause();
    };
  }, [isPlaying, activeScene, playAllMode, selectedIdx, scenes.length, isRecording]);

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      bgmAudioRef.current?.pause();
    } else {
      if (activeScene && sceneTime >= activeScene.duration_sec) setSceneTime(0);
      setIsPlaying(true);
    }
  };

  const handleStartRecordExport = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !activeProject || !activeScene) return;

    // Wire Web Audio API mixer so voiceover + BGM record into the WebM
    if (!audioCtxRef.current) {
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      if (voAudioRef.current) {
        const voSrc = ctx.createMediaElementSource(voAudioRef.current);
        voSrc.connect(dest);
        voSrc.connect(ctx.destination);
      }
      if (bgmAudioRef.current) {
        const bgmSrc = ctx.createMediaElementSource(bgmAudioRef.current);
        bgmSrc.connect(dest);
        bgmSrc.connect(ctx.destination);
      }
      audioCtxRef.current = ctx;
      audioDestRef.current = dest;
    }
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }

    const canvasStream = canvas.captureStream(30);
    const tracks = [...canvasStream.getVideoTracks()];
    if (audioDestRef.current) {
      tracks.push(...audioDestRef.current.stream.getAudioTracks());
    }
    const combined = new MediaStream(tracks);
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";

    const recorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    recordedChunksRef.current = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
    };
    recorder.onstop = async () => {
      setIsRecording(false);
      const blob = new Blob(recordedChunksRef.current, { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeProject.slug}-${activeProject.aspect_ratio.replace(":", "x")}.webm`;
      a.click();
      URL.revokeObjectURL(url);

      await fetch("/api/renders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: activeProject.id,
          engine: activeProject.visual_mode === "blender-3d" ? "Blender3D-Canvas-WebM" : "MooiIndie-KenBurns-WebM",
          aspect_ratio: activeProject.aspect_ratio,
          status: "completed",
          duration_sec: playAllMode ? activeProject.total_duration : activeScene.duration_sec,
        }),
      });
      await loadProjectDetail(activeProject.id);
    };

    recorderRef.current = recorder;
    setSceneTime(0);
    setIsRecording(true);
    recorder.start(250);
    setIsPlaying(true);
  };

  const handleStopRecord = () => {
    setIsPlaying(false);
    bgmAudioRef.current?.pause();
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
  };

  const handleProjectSettingChange = async (patch: Partial<Project>) => {
    if (!activeProject) return;
    setSaving(true);
    const res = await fetch(`/api/projects/${activeProject.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (data.ok) setActiveProject(data.project);
    setSaving(false);
  };

  const handleSaveScene = async () => {
    if (!activeProject || !activeScene) return;
    setSaving(true);
    const parsedCues: SubtitleCue[] = editSubtitles
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [times, text] = line.split("|");
        const [s, e] = (times || "0.8-6.0").split("-").map(Number);
        return {
          start: Number.isFinite(s) ? s : 0.8,
          end: Number.isFinite(e) ? e : 6.0,
          text: (text || "").replace(/\s*\/\s*/g, "\n"),
        };
      });

    const res = await fetch(`/api/projects/${activeProject.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scene: {
          id: activeScene.id,
          chapter_label: editLabel,
          title: editTitle,
          duration_sec: Math.max(5, Math.min(60, Number(editDuration) || 20)),
          subtitle_cues: parsedCues,
        },
      }),
    });
    const data = await res.json();
    if (data.ok) {
      setActiveProject(data.project);
      setScenes(data.scenes);
    }
    setSaving(false);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setSaving(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle.trim(),
        topic: newTopic.trim() || newTitle.trim(),
        chapters: newChapters,
        aspect_ratio: activeProject?.aspect_ratio || "9:16",
        visual_mode: activeProject?.visual_mode || "blender-3d",
      }),
    });
    const data = await res.json();
    if (data.ok) {
      setShowNewModal(false);
      setNewTitle("");
      setNewTopic("");
      await bootstrap();
      await loadProjectDetail(data.project.id);
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-[#0B0D12] text-[#F4EFE6]">
      {/* Hidden audio elements */}
      <audio ref={voAudioRef} crossOrigin="anonymous" preload="auto" />
      <audio ref={bgmAudioRef} src="/media/audio/bgm.mp3" loop crossOrigin="anonymous" preload="auto" />

      {/* Header */}
      <header className="border-b border-white/10 bg-[#111520]/90 backdrop-blur px-6 py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#C8102E] text-white shadow-lg shadow-[#C8102E]/30">
              <Film className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">Nusantara Cinema Studio</h1>
              <p className="font-mono-tech text-xs text-[#D4A359]">
                HYPERFRAMES + BLENDER 3D ENGINE · NEON POSTGRES
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono-tech text-xs ${
                dbStatus === "connected"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : dbStatus === "error"
                    ? "border-red-500/40 bg-red-500/10 text-red-300"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-300"
              }`}
              title={dbError || "Neon Serverless Postgres"}
            >
              <Database className="h-3.5 w-3.5" />
              {dbStatus === "connected" ? "Neon Postgres Live" : dbStatus === "error" ? "DB Error" : "Connecting..."}
            </div>

            <select
              className="rounded-lg border border-white/15 bg-[#171C2B] px-3 py-1.5 text-sm text-[#F4EFE6]"
              value={activeProject?.id ?? ""}
              onChange={(e) => loadProjectDetail(Number(e.target.value))}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.total_duration}s)
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[#D4A359] px-3.5 py-1.5 text-sm font-semibold text-[#0B0D12] hover:bg-[#e3b56c]"
            >
              <Plus className="h-4 w-4" /> Proyek Baru
            </button>
          </div>
        </div>
      </header>

      {/* Main Studio Grid */}
      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-6 p-6 lg:grid-cols-12">
        {/* Left: Cinema Stage & Controls */}
        <section className="lg:col-span-5 flex flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-[#131722] p-4 shadow-2xl">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleProjectSettingChange({ visual_mode: "blender-3d" })}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    activeProject?.visual_mode === "blender-3d"
                      ? "bg-[#C8102E] text-white"
                      : "bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                >
                  <Camera className="h-3.5 w-3.5" /> Blender 3D
                </button>
                <button
                  onClick={() => handleProjectSettingChange({ visual_mode: "mooi-indie" })}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    activeProject?.visual_mode === "mooi-indie"
                      ? "bg-[#D4A359] text-[#0B0D12]"
                      : "bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" /> Mooi Indië
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                {(["9:16", "16:9"] as const).map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => handleProjectSettingChange({ aspect_ratio: ratio })}
                    className={`rounded-lg px-2.5 py-1 font-mono-tech text-xs ${
                      activeProject?.aspect_ratio === ratio
                        ? "bg-white/20 text-white"
                        : "bg-white/5 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            {/* Canvas Viewport */}
            <div className="relative flex items-center justify-center overflow-hidden rounded-xl bg-black border border-white/10">
              <canvas
                ref={canvasRef}
                width={canvasDims.w}
                height={canvasDims.h}
                className={
                  activeProject?.aspect_ratio === "16:9"
                    ? "w-full aspect-video object-contain"
                    : "h-[560px] w-auto aspect-[9/16] object-contain"
                }
              />
              {isRecording && (
                <div className="absolute top-3 right-3 flex items-center gap-2 rounded-full bg-[#C8102E] px-3 py-1 font-mono-tech text-xs font-bold text-white animate-pulse">
                  ● REC {sceneTime.toFixed(1)}s
                </div>
              )}
            </div>

            {/* Scrubber & Transport */}
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className="font-mono-tech text-xs text-[#D4A359] w-12">
                  {sceneTime.toFixed(1)}s
                </span>
                <input
                  type="range"
                  min={0}
                  max={activeScene?.duration_sec || 20}
                  step={0.1}
                  value={sceneTime}
                  onChange={(e) => setSceneTime(Number(e.target.value))}
                  className="flex-1 accent-[#C8102E]"
                />
                <span className="font-mono-tech text-xs text-white/50 w-10 text-right">
                  {activeScene?.duration_sec || 20}s
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={togglePlay}
                    className="flex items-center gap-2 rounded-xl bg-[#F4EFE6] px-4 py-2 text-sm font-semibold text-[#0B0D12] hover:bg-white"
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {isPlaying ? "Jeda" : "Putar Film"}
                  </button>
                  <button
                    onClick={() => {
                      setIsPlaying(false);
                      setSceneTime(0);
                    }}
                    className="rounded-xl border border-white/15 p-2 text-white/80 hover:bg-white/10"
                    title="Reset adegan"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <label className="flex items-center gap-1.5 text-xs text-white/70 ml-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={playAllMode}
                      onChange={(e) => setPlayAllMode(e.target.checked)}
                      className="accent-[#D4A359]"
                    />
                    Auto-Bab
                  </label>
                </div>

                {!isRecording ? (
                  <button
                    onClick={handleStartRecordExport}
                    className="flex items-center gap-1.5 rounded-xl bg-[#C8102E] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#df193a]"
                  >
                    <Video className="h-4 w-4" /> Render &amp; Unduh WebM
                  </button>
                ) : (
                  <button
                    onClick={handleStopRecord}
                    className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-semibold text-black"
                  >
                    Stop &amp; Simpan
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Right: Storyboard + Director Editor + Neon Render Logs */}
        <section className="lg:col-span-7 flex flex-col gap-5">
          {/* Chapter Strip */}
          <div className="rounded-2xl border border-white/10 bg-[#131722] p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-[#D4A359]" />
                <h2 className="font-display text-lg font-bold">Storyboard Bab ({scenes.length} Adegan · {activeProject?.total_duration ?? 0}s)</h2>
              </div>
              {activeProject && (
                <a
                  href={`/api/projects/${activeProject.id}/export`}
                  className="flex items-center gap-1.5 rounded-lg border border-[#D4A359]/40 px-3 py-1.5 font-mono-tech text-xs text-[#D4A359] hover:bg-[#D4A359]/10"
                >
                  <Download className="h-3.5 w-3.5" /> Export HyperFrames JSON
                </a>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {scenes.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedIdx(idx);
                    setSceneTime(0);
                  }}
                  className={`rounded-xl border p-3 text-left transition ${
                    idx === selectedIdx
                      ? "border-[#C8102E] bg-[#C8102E]/15"
                      : "border-white/10 bg-white/5 hover:border-white/25"
                  }`}
                >
                  <div className="font-mono-tech text-[11px] text-[#D4A359]">BAB {s.chapter_index} · {s.duration_sec}s</div>
                  <div className="mt-1 line-clamp-1 font-display text-sm font-semibold">{s.title}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Scene Director Editor */}
          {activeScene && (
            <div className="rounded-2xl border border-white/10 bg-[#131722] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-lg font-bold">Editor Adegan #{activeScene.chapter_index}</h3>
                  <p className="font-mono-tech text-xs text-white/50">{activeScene.camera_preset}</p>
                </div>
                <button
                  onClick={handleSaveScene}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-xl bg-[#D4A359] px-4 py-2 text-xs font-bold text-[#0B0D12] hover:bg-[#e5b66d] disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" /> {saving ? "Menyimpan..." : "Simpan ke Neon DB"}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block font-mono-tech text-[11px] text-white/60 mb-1">LABEL BAB</label>
                  <input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-[#0B0D12] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-mono-tech text-[11px] text-white/60 mb-1">JUDUL ADEGAN</label>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-[#0B0D12] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-mono-tech text-[11px] text-white/60 mb-1">DURASI (DETIK)</label>
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={editDuration}
                    onChange={(e) => setEditDuration(Number(e.target.value))}
                    className="w-full rounded-lg border border-white/15 bg-[#0B0D12] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block font-mono-tech text-[11px] text-white/60 mb-1">
                  SUBTITLE SINEMATIK (format: mulai-selesai|teks baris 1 / baris 2)
                </label>
                <textarea
                  rows={4}
                  value={editSubtitles}
                  onChange={(e) => setEditSubtitles(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#0B0D12] px-3 py-2 font-mono-tech text-xs leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* Neon Render History */}
          <div className="rounded-2xl border border-white/10 bg-[#131722] p-5">
            <h3 className="mb-3 font-display text-base font-bold">Riwayat Render di Neon Postgres</h3>
            {renders.length === 0 ? (
              <p className="text-sm text-white/50">Belum ada riwayat render WebM. Klik “Render &amp; Unduh WebM” untuk merekam video langsung.</p>
            ) : (
              <div className="space-y-2">
                {renders.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0B0D12] px-3.5 py-2 text-xs">
                    <div>
                      <span className="font-semibold text-[#F4EFE6]">{r.engine}</span>
                      <span className="ml-2 font-mono-tech text-[#D4A359]">{r.aspect_ratio}</span>
                    </div>
                    <div className="font-mono-tech text-emerald-400">
                      {r.status.toUpperCase()} · {r.duration_sec}s
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* New Project Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <form onSubmit={handleCreateProject} className="w-full max-w-md rounded-2xl border border-white/15 bg-[#131722] p-6 space-y-4">
            <h2 className="font-display text-xl font-bold">Buat Proyek Film Dokumenter Baru</h2>
            <div>
              <label className="block font-mono-tech text-xs text-white/60 mb-1">JUDUL VIDEO</label>
              <input
                required
                placeholder="Misal: Kejayaan Maritim Majapahit"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-[#0B0D12] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block font-mono-tech text-xs text-white/60 mb-1">TOPIK / NARASI UTAMA</label>
              <input
                placeholder="Sejarah maritim dan perdagangan Nusantara"
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-[#0B0D12] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block font-mono-tech text-xs text-white/60 mb-1">JUMLAH BAB (3–8 BAB)</label>
              <input
                type="number"
                min={3}
                max={8}
                value={newChapters}
                onChange={(e) => setNewChapters(Number(e.target.value))}
                className="w-full rounded-lg border border-white/15 bg-[#0B0D12] px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowNewModal(false)} className="rounded-lg px-4 py-2 text-sm text-white/70 hover:bg-white/10">
                Batal
              </button>
              <button type="submit" disabled={saving} className="rounded-lg bg-[#C8102E] px-4 py-2 text-sm font-semibold text-white">
                {saving ? "Membuat..." : "Simpan & Generate"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
