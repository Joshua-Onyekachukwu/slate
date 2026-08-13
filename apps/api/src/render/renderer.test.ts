import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { unzipSync } from "fflate";
import { createRenderer, buildSrt, srtTime, buildAss, assTime, buildMusicBedExpr, RenderError, type RenderScene } from "./renderer";

// Phase 3 Block 4 - FFmpeg render/export (TDD). The renderer is PURE with an
// injectable ffmpeg runner, so the entire pipeline (segments → concat → audio →
// subtitles → thumbnail → manifest → zip package) is proven without ffmpeg
// installed. The fake runner records every argv and "creates" the output file
// (last arg) so downstream steps find it - the assertions are on the COMMAND
// contract, not on real transcoding (which needs ffmpeg on PATH + real media).

function tempDir(label: string) {
  const dir = mkdtempSync(join(tmpdir(), `slate-render-${label}-`));
  return dir;
}

// Records argv per invocation; touches the last arg (the output file) so the
// pipeline's later steps (concat needs seg_*.mp4, thumbnail needs out.mp4) find
// the file. Optionally returns a non-zero code to simulate a failing step.
function fakeRunner(log: string[][], failWith?: { step: RegExp; stderr: string }) {
  return async (args: string[], opts: { cwd?: string }) => {
    log.push(args);
    if (failWith && args.some((a) => failWith.step.test(a))) {
      return { code: 1, stdout: "", stderr: failWith.stderr };
    }
    const out = args[args.length - 1];
    const target = join(opts.cwd ?? ".", out);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, "fake-media", { flag: "a" });
    return { code: 0, stdout: "", stderr: "" };
  };
}

const SCENES: RenderScene[] = [
  {
    order: 1, title: "Cold open", narration: "In the beginning, there was nothing.",
    durationSeconds: 8, transition: "CUT", assets: [],
  },
  {
    order: 2, title: "The flash", narration: "Then, in less than a second, everything.",
    durationSeconds: 10, transition: "DISSOLVE", assets: [],
  },
  {
    order: 3, title: "First light", narration: "Hydrogen cooled into stars.",
    durationSeconds: 6, transition: "CUT", assets: [],
  },
];

describe("buildSrt / srtTime", () => {
  it("times each scene's caption with cumulative offsets", () => {
    const srt = buildSrt(SCENES);
    expect(srt).toContain("00:00:00,000 --> 00:00:08,000");
    expect(srt).toContain("00:00:08,000 --> 00:00:18,000");
    expect(srt).toContain("00:00:18,000 --> 00:00:24,000");
    expect(srt).toContain("In the beginning, there was nothing.");
    expect(srt).toContain("Hydrogen cooled into stars.");
  });

  it("formats sub-second precision as HH:MM:SS,mmm", () => {
    expect(srtTime(0)).toBe("00:00:00,000");
    expect(srtTime(65.5)).toBe("00:01:05,500");
    expect(srtTime(3661.25)).toBe("01:01:01,250");
  });
});

describe("buildAss / assTime", () => {
  it("builds a styled ASS script with cumulative Dialogue events", () => {
    const ass = buildAss(SCENES);
    expect(ass).toContain("Style: Default,Arial,32,");
    expect(ass).toContain("Dialogue: 0,0:00:00.00,0:00:08.00,Default,,0,0,0,,In the beginning, there was nothing.");
    expect(ass).toContain("Dialogue: 0,0:00:08.00,0:00:18.00,Default,,0,0,0,,Then, in less than a second, everything.");
    expect(ass).toContain("0:00:18.00,0:00:24.00");
    // Newlines in narration become ASS line breaks.
    expect(buildAss([{ ...SCENES[0], narration: "Line one\nLine two" }])).toContain("Line one\\NLine two");
  });

  it("formats sub-second precision as H:MM:SS.cc", () => {
    expect(assTime(0)).toBe("0:00:00.00");
    expect(assTime(65.5)).toBe("0:01:05.50");
    expect(assTime(3661.25)).toBe("1:01:01.25");
  });
});

describe("buildMusicBedExpr", () => {
  it("builds a filter-safe ambient pad expression (no commas/colons/pipes)", () => {
    const expr = buildMusicBedExpr();
    expect(expr).toContain("sin(2*PI*220*t)");
    expect(expr).toContain("0.028*sin(2*PI*277.18*t)");
    expect(expr).not.toMatch(/[,:|=]/); // must survive as a single -i lavfi arg
  });
});

describe("createRenderer().render", () => {
  it("builds one placeholder segment per scene with title overlay + duration", async () => {
    const log: string[][] = [];
    const dir = tempDir("seg");
    try {
      const renderer = createRenderer({
        rendersDir: dir, run: fakeRunner(log), probe: async () => true,
      });
      await renderer.render({ projectId: "p1", title: "The First Three Minutes", scenes: SCENES, outDir: join(dir, "p1", "r1") });

      // One segment invocation per scene, placeholder color source + overlays.
      // (some() - array includes does ELEMENT equality, not substring.)
      const segmentCalls = log.filter((a) => a.some((x) => x.includes("seg_")));
      expect(segmentCalls).toHaveLength(3);
      expect(segmentCalls[0].join(" ")).toContain("-f lavfi -i color=c=0x1E1A18:s=1280x720:d=8");
      expect(segmentCalls[0].join(" ")).toContain("textfile=title_1.txt");
      expect(segmentCalls[0].join(" ")).toContain("textfile=kicker_1.txt");
      expect(segmentCalls[0].join(" ")).toContain("fade=t=in:st=0:d=0.5");
      expect(segmentCalls[0].join(" ")).toContain("-t 8");
      expect(segmentCalls[0][segmentCalls[0].length - 1]).toBe("seg_1.mp4");
      expect(segmentCalls[1].join(" ")).toContain("d=10");
      expect(segmentCalls[2].join(" ")).toContain("d=6");
      // Overlay text files were written for the drawtext textfile= filters.
      expect(readFileSync(join(dir, "p1", "r1", "title_1.txt"), "utf8")).toBe("Cold open");
      expect(readFileSync(join(dir, "p1", "r1", "kicker_1.txt"), "utf8")).toBe("SC 01 · 8s · CUT");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("renders an image asset as a looped input and falls back to placeholders otherwise", async () => {
    const log: string[][] = [];
    const dir = tempDir("img");
    // A tiny real base64 PNG (1x1) - the renderer must materialize it to disk
    // and feed it to ffmpeg as `-loop 1 -i`, not pass the data: URI through.
    const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const scenes: RenderScene[] = [
      { ...SCENES[0], assets: [{ kind: "image", url: dataUri, mimeType: "image/png" }] },
      SCENES[1],
    ];
    try {
      const renderer = createRenderer({ rendersDir: dir, run: fakeRunner(log), probe: async () => true });
      await renderer.render({ projectId: "p1", title: "T", scenes, outDir: join(dir, "p1", "r1") });

      const seg1 = log.find((a) => a.includes("seg_1.mp4"))!;
      expect(seg1.join(" ")).toContain("assets/scene1-image.png"); // materialized file, not the data URI
      expect(existsSync(join(dir, "p1", "r1", "assets", "scene1-image.png"))).toBe(true);
      // Stills get Ken Burns motion (single-frame input + zoompan) not a static loop.
      expect(seg1.join(" ")).toContain("zoompan=z='min(1+0.0009*on,1.14)'");
      expect(seg1.join(" ")).toContain("-i assets/scene1-image.png");
      const seg2 = log.find((a) => a.includes("seg_2.mp4"))!;
      expect(seg2.join(" ")).toContain("color=c=0x1E1A18");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("downloads an http(s) image asset and feeds it to ffmpeg as a looped input", async () => {
    const log: string[][] = [];
    const dir = tempDir("http");
    const scenes: RenderScene[] = [
      { ...SCENES[0], assets: [{ kind: "image", url: "https://cdn.example/runner.jpg", mimeType: "image/jpeg" }] },
    ];
    try {
      const renderer = createRenderer({
        rendersDir: dir, run: fakeRunner(log), probe: async () => true,
        // Stub the downloader: the URL is "fetched" and its bytes land on disk.
        fetchAsset: async (url) => {
          expect(url).toBe("https://cdn.example/runner.jpg");
          return new Uint8Array([1, 2, 3, 4]);
        },
      });
      await renderer.render({ projectId: "p1", title: "T", scenes, outDir: join(dir, "p1", "r1") });

      const seg1 = log.find((a) => a.includes("seg_1.mp4"))!;
      expect(seg1.join(" ")).toContain("assets/scene1-image.jpg"); // suffix-derived ext, not the URL
      expect(existsSync(join(dir, "p1", "r1", "assets", "scene1-image.jpg"))).toBe(true);
      expect(seg1.join(" ")).toContain("zoompan=z=");
      // An unroutable URL falls back to the placeholder, never a 500.
      const offline = createRenderer({
        rendersDir: dir, run: fakeRunner(log), probe: async () => true,
        fetchAsset: async () => null,
      });
      await offline.render({ projectId: "p1", title: "T", scenes, outDir: join(dir, "p1", "offline") });
      // The offline render is the SECOND seg_1.mp4 invocation (ffmpeg runs with
      // cwd=outDir, so the segment arg is always the relative name).
      const offSeg = log.filter((a) => a.includes("seg_1.mp4"))[1]!;
      expect(offSeg.join(" ")).toContain("color=c=0x1E1A18");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs the full pipeline and produces mp4 + thumbnail + captions + manifest + zip package", async () => {
    const log: string[][] = [];
    const dir = tempDir("full");
    try {
      const renderer = createRenderer({ rendersDir: dir, run: fakeRunner(log), probe: async () => true });
      const result = await renderer.render({ projectId: "p1", title: "The First Three Minutes", scenes: SCENES, outDir: join(dir, "p1", "r1") });

      // Segment ×3 → concat → music bed → mix → captioned final → thumbnail.
      const out = join(dir, "p1", "r1");
      const callCount = log.filter((a) => a[0] !== "-version").length;
      expect(callCount).toBe(8); // 3 segments + concat + music + mix + final + thumbnail
      const concat = log.find((a) => a.includes("concat.txt"))!;
      expect(concat.join(" ")).toContain("-f concat -safe 0 -i concat.txt");
      expect(readFileSync(join(out, "concat.txt"), "utf8")).toBe("file 'seg_1.mp4'\nfile 'seg_2.mp4'\nfile 'seg_3.mp4'\n");
      // The procedural ambient bed is synthesized when no music asset exists.
      const music = log.find((a) => a.some((x) => x.includes("aevalsrc=")))!;
      expect(music.join(" ")).toContain("-af lowpass=f=1500");
      expect(music.join(" ")).toContain("-c:a aac");
      // No voice assets → the bed alone is the mix.
      const mix = log.find((a) => a.some((x) => x === "audio.m4a"))!;
      expect(mix.join(" ")).toContain("-i music.m4a");
      expect(mix.join(" ")).toContain("volume=0.85");
      // Final: styled ASS captions burned in (fontsdir is appended on hosts
      // with a detected system font - substring match, not element equality).
      const final = log.find((a) => a.some((x) => x.includes("subtitles=captions.ass")))!;
      expect(final.join(" ")).toContain("-vf subtitles=captions.ass");
      const thumb = log.find((a) => a.includes("thumbnail.png"))!;
      expect(thumb.join(" ")).toContain("-ss 1");
      expect(thumb.join(" ")).toContain("-frames:v 1");

      // Outputs on disk.
      for (const f of ["out.mp4", "thumbnail.png", "captions.srt", "captions.ass", "manifest.json", "slate-render.zip"]) {
        expect(existsSync(join(out, f)), f).toBe(true);
      }

      // Manifest: scenes in order with their source kinds + assets + package refs.
      const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
      expect(manifest.projectId).toBe("p1");
      expect(manifest.title).toBe("The First Three Minutes");
      expect(manifest.scenes.map((s: { order: number }) => s.order)).toEqual([1, 2, 3]);
      expect(manifest.scenes.map((s: { motion: string }) => s.motion)).toEqual(["none", "none", "none"]);
      expect(manifest.finishing).toMatchObject({ motion: true, captions: true, musicBed: true, audioBed: true, ducking: false });
      expect(manifest.package).toMatchObject({ mp4: "out.mp4", thumbnail: "thumbnail.png", captions: "captions.srt", captionsAss: "captions.ass" });

      // The zip package contains the five deliverables.
      const zip = unzipSync(new Uint8Array(readFileSync(join(out, "slate-render.zip"))));
      expect(Object.keys(zip).sort()).toEqual(["captions.ass", "captions.srt", "manifest.json", "out.mp4", "thumbnail.png"]);

      expect(result.mp4).toBe("out.mp4");
      expect(result.segments).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("delays each scene's voice clip to its scene start and ducks the bed under it", async () => {
    const log: string[][] = [];
    const dir = tempDir("voice");
    try {
      const wav = "data:audio/wav;base64,UklGRgAAAAABAAAA"; // shape only - the fake runner never decodes
      const scenes: RenderScene[] = [
        { order: 1, title: "A", narration: "One.", durationSeconds: 8, transition: "CUT", assets: [{ kind: "voice", url: wav, mimeType: "audio/wav" }] },
        { order: 2, title: "B", narration: "Two.", durationSeconds: 6, transition: "CUT", assets: [{ kind: "voice", url: wav, mimeType: "audio/wav" }] },
      ];
      const renderer = createRenderer({ rendersDir: dir, run: fakeRunner(log), probe: async () => true });
      await renderer.render({ projectId: "p1", title: "T", scenes, outDir: join(dir, "p1", "r1") });

      // Mix step: both voice clips materialized as inputs, delayed to their
      // scene offsets (scene 1 at 0s, scene 2 at 8s), bed ducked under them.
      const mix = log.find((a) => a.some((x) => x === "audio.m4a"))!;
      const fc = mix.join(" ");
      expect(fc).toContain("-i assets/scene1-voice.wav");
      expect(fc).toContain("-i assets/scene2-voice.wav");
      expect(fc).toContain("adelay=0:all=1");
      expect(fc).toContain("adelay=8000:all=1");
      expect(fc).toContain("sidechaincompress");
      expect(fc).toContain("amix=inputs=2:duration=longest:normalize=0[voice]");

      const manifest = JSON.parse(readFileSync(join(dir, "p1", "r1", "manifest.json"), "utf8"));
      expect(manifest.finishing.ducking).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("mixes delayed narration as the sole audio track when no music bed exists", async () => {
    const log: string[][] = [];
    const dir = tempDir("voicenobed");
    try {
      const wav = "data:audio/wav;base64,UklGRgAAAAABAAAA";
      const scenes: RenderScene[] = [
        { order: 1, title: "A", narration: "One.", durationSeconds: 8, transition: "CUT", assets: [{ kind: "voice", url: wav, mimeType: "audio/wav" }] },
      ];
      const renderer = createRenderer({ rendersDir: dir, run: fakeRunner(log), probe: async () => true });
      await renderer.render({ projectId: "p1", title: "T", scenes, outDir: join(dir, "p1", "r1"), musicBed: false });

      const mix = log.find((a) => a.some((x) => x === "audio.m4a"))!;
      const fc = mix.join(" ");
      expect(fc).toContain("adelay=0:all=1[vd0]");
      // apad inside the graph pins the track to the film length (the output
      // -t trims the padded stream to totalSeconds).
      expect(fc).toContain("[voice]volume=1.0,apad[out]");
      expect(fc).not.toContain("sidechaincompress");
      expect(fc).not.toContain("music.m4a");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects with FFMPEG_MISSING when no ffmpeg binary is available", async () => {
    const dir = tempDir("missing");
    try {
      const renderer = createRenderer({ rendersDir: dir, run: fakeRunner([]), probe: async () => false });
      await expect(renderer.render({ projectId: "p1", title: "T", scenes: [SCENES[0]], outDir: join(dir, "p1", "r1") }))
        .rejects.toMatchObject({ code: "FFMPEG_MISSING" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects with RENDER_FAILED carrying the ffmpeg stderr when a step exits non-zero", async () => {
    const log: string[][] = [];
    const dir = tempDir("fail");
    try {
      const renderer = createRenderer({
        rendersDir: dir,
        run: fakeRunner(log, { step: /concat/, stderr: "concat: Invalid data found when processing input" }),
        probe: async () => true,
      });
      try {
        await renderer.render({ projectId: "p1", title: "T", scenes: [SCENES[0], SCENES[1]], outDir: join(dir, "p1", "r1") });
        expect.unreachable("render should have rejected");
      } catch (e) {
        expect(e).toBeInstanceOf(RenderError);
        expect((e as RenderError).code).toBe("RENDER_FAILED");
        expect((e as RenderError).message).toContain("Invalid data found");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
