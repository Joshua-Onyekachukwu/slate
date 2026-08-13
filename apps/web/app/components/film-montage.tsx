"use client";

// The demo cut, playing: a three-shot montage that cycles the runner stills and
// the hero clip so the preview shows the WHOLE cut, not just the cold open.
// Shots follow the demo film's slate metadata - SC 01 cold open on the hero
// clip (plays through, advances on end), SC 02 the moment, SC 03 the finish
// (stills hold ~3.6s with a slow push-in) - then the loop restarts. Stands in
// for the rendered cut until a real render of THIS plan is exported.
//
// The slate overlays speak the cutting-room token language (REC dot, timecode,
// mono labels), reusing the film-preview screen from the workspace.

import { useEffect, useRef, useState } from "react";

export interface MontageShot {
  kind: "video" | "still";
  src: string;
  poster?: string;
  n: string; // "01"
  tc: string; // "00:00:00:00"
  cap: string; // "Cold open"
  shot: string; // "EXT · WIDE · PUSH-IN"
  hold: number; // ms before advancing (video: safety net, ends early)
}

export const DEMO_CUT: MontageShot[] = [
  {
    kind: "video",
    src: "/frames/cold-open.mp4",
    poster: "/frames/cold-open.jpg",
    n: "01",
    tc: "00:00:00:00",
    cap: "Cold open",
    shot: "EXT · WIDE · PUSH-IN",
    hold: 12000,
  },
  {
    kind: "still",
    src: "/frames/the-flash.jpg",
    n: "02",
    tc: "00:00:14:00",
    cap: "The moment",
    shot: "EXT · MED · OTS",
    hold: 3600,
  },
  {
    kind: "still",
    src: "/frames/first-light.jpg",
    n: "03",
    tc: "00:00:28:00",
    cap: "The finish",
    shot: "EXT · WIDE · CRANE-DOWN",
    hold: 3600,
  },
];

export function FilmMontage({
  shots = DEMO_CUT,
  ariaLabel = "Preview of the finished cut, a three-shot montage cycling",
}: {
  shots?: MontageShot[];
  ariaLabel?: string;
}) {
  const [i, setI] = useState(0);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const seg = shots[i % shots.length];

  const next = () => setI((p) => (p + 1) % shots.length);

  // Restart the media + autoplay the hero clip on each video segment.
  useEffect(() => {
    const v = videoRef.current;
    if (seg.kind === "video" && v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
  }, [i, seg.kind]);

  // Advance: stills on their hold timer; the video advances on onEnded with the
  // hold as a safety net (a stalled clip never freezes the montage).
  useEffect(() => {
    const t = setTimeout(next, seg.hold);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, seg.hold, shots.length]);

  // Progress fill: video tracks currentTime/duration, stills tick to 100.
  useEffect(() => {
    setProgress(0);
    const id = setInterval(() => {
      if (seg.kind === "video") {
        const v = videoRef.current;
        setProgress(v && v.duration ? (v.currentTime / v.duration) * 100 : 0);
      } else {
        setProgress((p) => Math.min(100, p + (100 / seg.hold) * 100));
      }
    }, 100);
    return () => clearInterval(id);
  }, [i, seg.kind, seg.hold]);

  return (
    <div className="montage" aria-label={ariaLabel}>
      {seg.kind === "video" ? (
        <video
          key={`v-${i}`}
          ref={videoRef}
          className="montage-media"
          src={seg.src}
          poster={seg.poster}
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={next}
        />
      ) : (
        <img
          key={`s-${i}`}
          className="montage-media montage-still"
          src={seg.src}
          alt={`${seg.cap}: ${seg.shot}`}
        />
      )}
      <span className="film-preview-tc">
        <i className="rec-dot"></i> SC {seg.n} · {seg.tc}
      </span>
      <span className="montage-slate">
        {seg.cap} · {seg.shot}
      </span>
      <span className="montage-segs" aria-hidden="true">
        {shots.map((_, k) => (
          <i key={k} className={k === i % shots.length ? "on" : ""} />
        ))}
      </span>
      <span className="montage-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </span>
    </div>
  );
}
