import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { zipSync } from "fflate";
import type { AssetKind } from "@slate/shared";

// Phase 3 Block 4 - FFmpeg render/export (queue: "stitch approved assets,
// captions, transitions, audio mix → MP4 + thumbnail + project package").
//
// The pipeline is PURE with an injectable runner so it's fully testable without
// ffmpeg installed (tests use a fake runner that records argv). The real runner
// spawns FFMPEG_PATH ?? "ffmpeg". The render is a "finishing pass": the moment
// the plan locks, the cut comes out looking finished, not assembled -
//
//   - Motion: still-image scenes get a slow Ken Burns push-in/pull-out
//     (alternating per scene) so the film never reads as a slideshow. Real
//     video assets are trimmed to the scene duration. Placeholder frames fall
//     back to the --surface color with the title card.
//   - Transitions: every segment fades in/out 0.5s - a soft, deliberate cut
//     rhythm between scenes regardless of the recorded transition tag.
//   - Overlays: a centered title card + a production lower-third
//     ("SC 01 · 8s · CUT") per scene, drawn via textfile= (no escaping issues).
//   - Captions: narration burns as STYLED subtitles from a generated
//     captions.ass (Arial, sized, outlined, bottom-center) - libass styling,
//     not the raw SRT. The plain captions.srt is still shipped as a
//     deliverable alongside the .ass.
//   - Music: a procedural ambient bed (warm A-minor pad, LFO-swelling, low
//     passed) is synthesized by ffmpeg when the plan carries no music asset,
//     then mixed UNDER any voiceover assets with sidechain ducking - the film
//     always ships with a real, finished audio bed.
//
// RenderError codes: FFMPEG_MISSING (no binary; the route maps to 501
// RENDER_UNAVAILABLE) and RENDER_FAILED (ffmpeg exited non-zero; → 502).

export type RenderErrorCode = "FFMPEG_MISSING" | "RENDER_FAILED";

export class RenderError extends Error {
  code: RenderErrorCode;
  constructor(code: RenderErrorCode, message: string) {
    super(message);
    this.name = "RenderError";
    this.code = code;
  }
}

export interface RenderAsset {
  kind: AssetKind;
  url: string;
  mimeType: string | null;
}

export interface RenderScene {
  order: number;
  title: string;
  narration: string;
  durationSeconds: number;
  transition: string; // CUT | DISSOLVE | ... (recorded in the manifest)
  assets: RenderAsset[];
}

export interface RenderRequest {
  projectId: string;
  title: string;
  scenes: RenderScene[];
  outDir: string; // absolute - the route namespaces it <rendersDir>/<projectId>/<renderId>
  // Finishing-pass toggles (all default ON - the cut should look finished with
  // zero extra work). motion = Ken Burns on stills; captions = styled .ass burn;
  // musicBed = procedural ambient bed under any voice assets.
  motion?: boolean;
  captions?: boolean;
  musicBed?: boolean;
}

export interface RenderResult {
  mp4: string;      // "out.mp4"
  thumbnail: string; // "thumbnail.png"
  captions: string; // "captions.srt"
  manifest: string; // "manifest.json"
  pkg: string;      // "slate-render.zip"
  segments: number;
  ffmpeg: string;
}

export type FfmpegRun = (
  args: string[],
  opts: { cwd?: string },
) => Promise<{ code: number; stdout: string; stderr: string }>;

export interface RendererOptions {
  ffmpegPath?: string;
  run?: FfmpegRun;
  probe?: () => Promise<boolean>; // default: spawn `<ffmpegPath> -version`
  rendersDir?: string;            // default: RENDERS_DIR env → ./data/renders
  // Injectable media downloader for http(s) asset URLs (hosted generator
  // outputs, the demo media server). Default: global fetch → bytes. Tests stub
  // it so the download path is proven without a network round-trip.
  fetchAsset?: (url: string) => Promise<Uint8Array | null>;
}

export interface Renderer {
  readonly name: string;
  readonly rendersDir: string;
  render(req: RenderRequest): Promise<RenderResult>;
}

// ---------- captions ----------

export function srtTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const ms = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(ms).padStart(3, "0")}`;
}

export function buildSrt(scenes: RenderScene[]): string {
  let cursor = 0;
  return scenes
    .map((s, i) => {
      const start = cursor;
      const end = cursor + s.durationSeconds;
      cursor = end;
      return `${i + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${s.narration}\n`;
    })
    .join("\n");
}

// ASS timestamps are H:MM:SS.cc (centiseconds).
export function assTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const cs = Math.round((totalSeconds - Math.floor(totalSeconds)) * 100);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`;
}

// Styled narration captions: Arial 32, white with a dark outline + soft shadow,
// bottom-center (Alignment 2, MarginV 46), 2px outline. Burned via
// `subtitles=captions.ass` - libass styling, far more film-like than raw SRT.
export function buildAss(scenes: RenderScene[]): string {
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1280",
    "PlayResY: 720",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Default,Arial,32,&H00FFFFFF,&H000000FF,&H00141410,&H78000000,0,0,0,0,100,100,0,0,1,2,1,2,70,70,46,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");
  let cursor = 0;
  const events = scenes
    .map((s) => {
      const start = cursor;
      const end = cursor + s.durationSeconds;
      cursor = end;
      const text = s.narration.replace(/\n/g, "\\N");
      return `Dialogue: 0,${assTime(start)},${assTime(end)},Default,,0,0,0,,${text}`;
    })
    .join("\n");
  return `${header}\n${events}\n`;
}

// ---------- ffmpeg runners ----------

function defaultRun(ffmpegPath: string): FfmpegRun {
  return (args, opts) =>
    new Promise((resolve) => {
      const child = spawn(ffmpegPath, args, { cwd: opts.cwd });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      child.on("error", (err) => resolve({ code: -1, stdout, stderr: err.message }));
      child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
    });
}

let probeCache: { path: string; ok: boolean } | null = null;

function defaultProbe(ffmpegPath: string) {
  return async () => {
    if (probeCache && probeCache.path === ffmpegPath) return probeCache.ok;
    const res = await defaultRun(ffmpegPath)(["-version"], {});
    probeCache = { path: ffmpegPath, ok: res.code === 0 };
    return probeCache.ok;
  };
}

// ---------- helpers ----------

// Materialize an asset URL to a file under outDir/assets and return the RELATIVE
// path (the ffmpeg steps run with cwd=outDir). Supports three shapes:
//   data: URIs       - decoded straight to disk
//   http(s) URLs     - downloaded via the injectable fetchAsset (hosted
//                      generator outputs and the demo media server)
//   plain file paths - copied from disk (absolute or API-cwd-relative) so the
//                      render dir stays self-contained
// Returns null when the URL can't be materialized (fake:// refs, bad responses)
// - the scene falls back to a placeholder frame rather than passing an
// unreadable URL to ffmpeg.
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
  "video/mp4": "mp4", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav",
};

function extFor(url: string, mime: string | null): string {
  if (mime && EXT_BY_MIME[mime]) return EXT_BY_MIME[mime];
  const suffix = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  return suffix === "jpeg" ? "jpg" : suffix;
}

async function materializeAsset(
  url: string,
  mime: string | null,
  prefix: string,
  outDir: string,
  fetchAsset: (url: string) => Promise<Uint8Array | null>,
): Promise<string | null> {
  // Forward slashes always: this path goes into ffmpeg args (not fs), and
  // ffmpeg accepts / on Windows while the tests assert a stable separator.
  const rel = `assets/${prefix}.${extFor(url, mime)}`;
  const target = join(outDir, rel);
  try {
    if (url.startsWith("data:")) {
      const m = url.match(/^data:([^;,]+);base64,(.+)$/s);
      if (!m) return null;
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, Buffer.from(m[2], "base64"));
      return rel;
    }
    if (/^https?:\/\//.test(url)) {
      const bytes = await fetchAsset(url);
      if (!bytes) return null;
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, Buffer.from(bytes));
      return rel;
    }
    // Plain path (absolute or cwd-relative): copy it in.
    if (existsSync(url)) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(url));
      return rel;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------- segment visuals ----------

const FRAME_W = 1280;
const FRAME_H = 720;
const FPS = 24;

// ffmpeg's drawtext/libass fall back to fontconfig, which is unconfigured (and
// can SEGFAULT, e.g. gyan Windows builds) without a default config. Copy a real
// system font into the render dir and reference it as a RELATIVE path
// (fonts/font.ttf) - no colons or backslashes in filter values, so no escaping
// pitfalls on any host. Returns null when no system font is found (falls back
// to fontconfig, which works on well-configured hosts).
const FONT_SOURCES = [
  "C:/Windows/Fonts/arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/System/Library/Fonts/Helvetica.ttc",
];

function copyFont(outDir: string): string | null {
  for (const src of FONT_SOURCES) {
    if (!existsSync(src)) continue;
    try {
      const target = join(outDir, "fonts", "font.ttf");
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(src));
      return "fonts/font.ttf";
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function drawtexts(scene: RenderScene, i: number, fontRel: string | null): string {
  const fontOpt = fontRel ? `fontfile=${fontRel}:` : "";
  // Centered title card on a soft scrim (readable over any imagery)...
  const title = `drawtext=${fontOpt}textfile=title_${i + 1}.txt:fontcolor=white:fontsize=44:box=1:boxcolor=black@0.32:boxborderw=16:x=(w-text_w)/2:y=(h-text_h)/2`;
  // ...and a production lower-third: "SC 01 · 8s · CUT" bottom-left.
  const kicker = `drawtext=${fontOpt}textfile=kicker_${i + 1}.txt:fontcolor=white@0.85:fontsize=24:box=1:boxcolor=black@0.35:boxborderw=10:x=48:y=h-92`;
  return `${title},${kicker}`;
}

// Ken Burns expression per scene: even scenes push in, odd scenes pull out -
// gentle 0.0009/frame (~2% per second), capped so the zoom never oversteps.
function kenburns(scene: RenderScene, i: number): string {
  const inExpr = "min(1+0.0009*on,1.14)";
  const outExpr = "max(1.14-0.0009*on,1.0)";
  const z = i % 2 === 0 ? inExpr : outExpr;
  const frames = Math.max(1, Math.round(scene.durationSeconds * FPS));
  return `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${FRAME_W}x${FRAME_H}:fps=${FPS}`;
}

// Source + filter for one scene's segment. Returns the input args and the
// video filter chain that normalizes to 1280x720/24fps with motion, fades,
// and the overlay text.
async function segmentGraph(
  scene: RenderScene,
  i: number,
  outDir: string,
  fetchAsset: (url: string) => Promise<Uint8Array | null>,
  motion: boolean,
  fontRel: string | null,
): Promise<{ input: string[]; vf: string; kind: "color" | "loop" | "video" }> {
  const d = scene.durationSeconds;
  const fadeIn = "fade=t=in:st=0:d=0.5";
  const fadeOut = `fade=t=out:st=${Math.max(0, d - 0.5).toFixed(2)}:d=0.5`;
  const overlays = drawtexts(scene, i, fontRel);

  const video = scene.assets.find((a) => a.kind === "video" && a.mimeType?.startsWith("video/"));
  if (video) {
    const rel = await materializeAsset(video.url, video.mimeType, `scene${i + 1}-video`, outDir, fetchAsset);
    if (rel) {
      const base = `scale=${FRAME_W}:${FRAME_H}:force_original_aspect_ratio=decrease,pad=${FRAME_W}:${FRAME_H}:(ow-iw)/2:(oh-ih)/2:color=black,${fadeIn},${fadeOut},${overlays}`;
      return { input: ["-i", rel], vf: base, kind: "video" };
    }
  }

  const image = scene.assets.find((a) => a.kind === "image");
  if (image) {
    const rel = await materializeAsset(image.url, image.mimeType, `scene${i + 1}-image`, outDir, fetchAsset);
    if (rel) {
      // Single still frame in, Ken Burns frames out (zoompan d=<frames>).
      const motionChain = motion ? `${kenburns(scene, i)},` : "";
      const base = `scale=${FRAME_W}:${FRAME_H}:force_original_aspect_ratio=increase,crop=${FRAME_W}:${FRAME_H},${motionChain}format=yuv420p,${fadeIn},${fadeOut},${overlays}`;
      return { input: ["-i", rel], vf: base, kind: "loop" };
    }
  }

  // Placeholder: the --surface token (#1E1A18) at 1280x720 for the duration.
  const base = `${fadeIn},${fadeOut},${overlays}`;
  return {
    input: ["-f", "lavfi", "-i", `color=c=0x1E1A18:s=${FRAME_W}x${FRAME_H}:d=${d}`],
    vf: base,
    kind: "color",
  };
}

// ---------- music bed ----------

// Procedural ambient bed: a warm A-minor add9 pad (A, C#, E, B) with a slow
// amplitude swell, low-passed for softness. No external audio needed - the film
// always ships with a finished, quiet musical bed under the narration.
export function buildMusicBedExpr(): string {
  const lfo = "(0.7+0.3*sin(2*PI*0.08*t))";
  return [
    `0.04*sin(2*PI*220*t)*${lfo}`,
    "+0.028*sin(2*PI*277.18*t)",
    "+0.024*sin(2*PI*329.63*t)",
    "+0.016*sin(2*PI*440*t)",
  ].join("");
}

// ---------- renderer ----------

export function createRenderer(opts: RendererOptions = {}): Renderer {
  const ffmpegPath = opts.ffmpegPath ?? process.env.FFMPEG_PATH ?? "ffmpeg";
  const rendersDir = opts.rendersDir ?? process.env.RENDERS_DIR ?? join(process.cwd(), "data", "renders");
  const run = opts.run ?? defaultRun(ffmpegPath);
  const probe = opts.probe ?? defaultProbe(ffmpegPath);
  const fetchAsset = opts.fetchAsset ?? (async (url: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    } catch {
      return null;
    }
  });

  async function step(args: string[], outDir: string): Promise<void> {
    const res = await run(args, { cwd: outDir });
    if (res.code !== 0) {
      throw new RenderError("RENDER_FAILED", `ffmpeg ${args[0] ?? ""} exited ${res.code}: ${(res.stderr || res.stdout).slice(0, 500)}`);
    }
  }

  return {
    name: "ffmpeg",
    rendersDir,

    async render(req: RenderRequest): Promise<RenderResult> {
      if (!(await probe())) {
        throw new RenderError("FFMPEG_MISSING", `ffmpeg (${ffmpegPath}) is not installed - install FFmpeg or set FFMPEG_PATH`);
      }
      const { outDir, scenes } = req;
      const motion = req.motion !== false;
      const captions = req.captions !== false;
      const musicBed = req.musicBed !== false;
      mkdirSync(outDir, { recursive: true });
      const fontRel = copyFont(outDir); // "fonts/font.ttf" or null

      const totalSeconds = scenes.reduce((acc, s) => acc + s.durationSeconds, 0);

      // 1. Captions (SRT deliverable + styled ASS burn) and overlay text files.
      writeFileSync(join(outDir, "captions.srt"), buildSrt(scenes));
      writeFileSync(join(outDir, "captions.ass"), buildAss(scenes));
      scenes.forEach((s, i) => {
        writeFileSync(join(outDir, `title_${i + 1}.txt`), s.title);
        writeFileSync(join(outDir, `kicker_${i + 1}.txt`), `SC ${String(s.order).padStart(2, "0")} · ${s.durationSeconds}s · ${s.transition}`);
      });

      // 2. One normalized segment per scene (sequential - the fake runner and
      // real ffmpeg both resolve in order, keeping the log deterministic).
      const segmentFiles: string[] = [];
      const sourceKinds: string[] = [];
      const motionApplied: string[] = [];
      for (const [i, s] of scenes.entries()) {
        const seg = `seg_${i + 1}.mp4`;
        segmentFiles.push(seg);
        const graph = await segmentGraph(s, i, outDir, fetchAsset, motion, fontRel);
        sourceKinds.push(graph.kind);
        motionApplied.push(graph.kind === "loop" && motion ? "kenburns" : graph.kind === "video" ? "trim" : "none");
        await step([
          "-y", ...graph.input, "-vf", graph.vf,
          "-t", String(s.durationSeconds), "-r", String(FPS),
          "-c:v", "libx264", "-pix_fmt", "yuv420p", seg,
        ], outDir);
      }

      // 3. Concat the normalized segments.
      writeFileSync(join(outDir, "concat.txt"), segmentFiles.map((f) => `file '${f}'`).join("\n") + "\n");
      await step(["-y", "-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", "video.mp4"], outDir);

      // 4. Audio mix: the procedural music bed (or a materialized music asset)
      // under any voice assets, with sidechain ducking when narration exists.
      // Voice clips are delayed to their scene's start time (cumulative scene
      // durations), so each narration line lands during its own scene instead
      // of all voices stacking at t=0.
      const musicAssets: string[] = [];
      const voiceClips: { rel: string; delayMs: number }[] = [];
      let cursor = 0;
      for (const [i, s] of scenes.entries()) {
        for (const a of s.assets) {
          const rel = await materializeAsset(a.url, a.mimeType, `scene${i + 1}-${a.kind}`, outDir, fetchAsset);
          if (rel && a.kind === "music") musicAssets.push(rel);
          if (rel && a.kind === "voice") voiceClips.push({ rel, delayMs: Math.round(cursor * 1000) });
        }
        cursor += s.durationSeconds;
      }
      if (musicAssets.length === 0 && musicBed) {
        await step([
          "-y", "-f", "lavfi", "-i", `aevalsrc=${buildMusicBedExpr()}`,
          "-t", String(totalSeconds), "-af", "lowpass=f=1500", "-ac", "2",
          "-c:a", "aac", "-b:a", "128k", "music.m4a",
        ], outDir);
        musicAssets.push("music.m4a");
      }
      if (musicAssets.length > 0 || voiceClips.length > 0) {
        const inputs = musicAssets.flatMap((f) => ["-i", f]).concat(voiceClips.flatMap((v) => ["-i", v.rel]));
        const voiceIdx = musicAssets.length; // first voice input index
        let fc: string;
        if (voiceClips.length > 0) {
          const delayed = voiceClips
            .map((v, k) => `[${voiceIdx + k}:a]adelay=${v.delayMs}:all=1[vd${k}]`)
            .join(";");
          const voiceMix = voiceClips.length === 1
            ? `[vd0]volume=1.0[voice]`
            : `${voiceClips.map((_, k) => `[vd${k}]`).join("")}amix=inputs=${voiceClips.length}:duration=longest:normalize=0[voice]`;
          if (voiceIdx === 0) {
            // No music bed - the delayed narration alone is the audio track.
            fc = `${delayed};${voiceMix};[voice]volume=1.0,apad[out]`;
          } else {
            fc = `[0:a]volume=0.6[bed];${delayed};${voiceMix};[voice]asplit[vc][vs];[bed][vs]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=250[duck];[vc][duck]amix=inputs=2:duration=longest:normalize=0,apad[out]`;
          }
        } else {
          fc = "[0:a]volume=0.85,apad[out]";
        }
        // apad inside the graph + -t on the output pins the mix to the exact
        // film length: sidechaincompress truncates the ducked bed to the
        // narration's duration, so without the pad the audio (and, via
        // -shortest, the video) would end early when narration is shorter
        // than the cut. (A plain -af apad can't be used here - simple and
        // complex filtering can't share the same stream.)
        await step(["-y", ...inputs, "-filter_complex", fc, "-map", "[out]", "-t", String(totalSeconds), "-c:a", "aac", "audio.m4a"], outDir);
      } else {
        await step(["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", String(totalSeconds), "-c:a", "aac", "audio.m4a"], outDir);
      }

      // 5. Burn styled captions (or plain concat) + attach audio → final MP4.
      const fontsDir = fontRel ? `:fontsdir=fonts` : "";
      const vf = captions ? `subtitles=captions.ass${fontsDir}` : "null";
      await step(
        captions
          ? ["-y", "-i", "video.mp4", "-i", "audio.m4a", "-vf", vf, "-c:v", "libx264", "-c:a", "aac", "-shortest", "out.mp4"]
          : ["-y", "-i", "video.mp4", "-i", "audio.m4a", "-c:v", "copy", "-c:a", "aac", "-shortest", "out.mp4"],
        outDir,
      );

      // 6. Thumbnail frame grab.
      await step(["-y", "-ss", "1", "-i", "out.mp4", "-frames:v", "1", "-q:v", "2", "thumbnail.png"], outDir);

      // 7. Manifest + zip package.
      const manifest = {
        projectId: req.projectId,
        title: req.title,
        renderedAt: new Date().toISOString(),
        ffmpeg: ffmpegPath,
        finishing: {
          motion, captions, musicBed,
          audioBed: musicAssets.length > 0 && !scenes.some((s) => s.assets.some((a) => a.kind === "music")),
          ducking: voiceClips.length > 0,
        },
        scenes: scenes.map((s, i) => ({
          order: s.order,
          title: s.title,
          durationSeconds: s.durationSeconds,
          transition: s.transition,
          source: sourceKinds[i] === "color" ? "placeholder" : sourceKinds[i],
          motion: motionApplied[i],
          assets: s.assets.map((a) => ({ kind: a.kind, url: a.url, mimeType: a.mimeType })),
        })),
        package: { mp4: "out.mp4", thumbnail: "thumbnail.png", captions: "captions.srt", captionsAss: "captions.ass" },
      };
      writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

      const pkg = "slate-render.zip";
      const files: Record<string, Uint8Array> = {};
      for (const f of ["out.mp4", "thumbnail.png", "captions.srt", "captions.ass", "manifest.json"]) {
        files[f] = new Uint8Array(readFileSync(join(outDir, f)));
      }
      writeFileSync(join(outDir, pkg), Buffer.from(zipSync(files)));

      return { mp4: "out.mp4", thumbnail: "thumbnail.png", captions: "captions.srt", manifest: "manifest.json", pkg, segments: scenes.length, ffmpeg: ffmpegPath };
    },
  };
}
