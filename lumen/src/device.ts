// device.ts — client codec detection, device presets, and release scoring

export type VideoCodec = "h264" | "hevc" | "av1" | "vp9";
export type AudioCodec = "aac" | "ac3" | "eac3" | "dts" | "dtshd" | "truehd";

export interface DeviceProfile {
  id: string;
  label: string;
  maxResolution: "720p" | "1080p" | "4K";
  video: VideoCodec[];
  audio: AudioCodec[];
}

export const PRESETS: DeviceProfile[] = [
  {
    id: "browser-chrome",
    label: "Browser — Chrome / Edge / Firefox",
    maxResolution: "4K",
    video: ["h264", "vp9", "av1"],
    audio: ["aac"],
  },
  {
    id: "browser-safari",
    label: "Browser — Safari",
    maxResolution: "4K",
    video: ["h264", "hevc"],
    audio: ["aac", "ac3", "eac3"],
  },
  {
    id: "smarttv-h264",
    label: "Smart TV — H.264 only",
    maxResolution: "4K",
    video: ["h264"],
    audio: ["aac", "ac3"],
  },
  {
    id: "smarttv-hevc",
    label: "Smart TV — HEVC / H.265",
    maxResolution: "4K",
    video: ["h264", "hevc"],
    audio: ["aac", "ac3", "eac3", "dts"],
  },
  {
    id: "appletv",
    label: "Apple TV 4K",
    maxResolution: "4K",
    video: ["h264", "hevc"],
    audio: ["aac", "ac3", "eac3", "truehd"],
  },
  {
    id: "android-tv",
    label: "Android TV / Fire TV",
    maxResolution: "4K",
    video: ["h264", "hevc", "vp9", "av1"],
    audio: ["aac", "ac3", "eac3", "dts"],
  },
  {
    id: "roku",
    label: "Roku",
    maxResolution: "4K",
    video: ["h264", "hevc"],
    audio: ["aac", "ac3", "eac3"],
  },
];

const STORAGE_KEY = "lumen_device_profile";

export function getDeviceProfile(): DeviceProfile {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const p = PRESETS.find((x) => x.id === saved);
    if (p) return p;
  }
  return autoDetect();
}

export function saveDeviceProfile(id: string): void {
  localStorage.setItem(STORAGE_KEY, id);
}

function autoDetect(): DeviceProfile {
  const v = document.createElement("video");
  const hevc =
    v.canPlayType('video/mp4; codecs="hvc1.1.6.L150.B0"') !== "" ||
    v.canPlayType('video/mp4; codecs="hev1.1.6.L150.B0"') !== "";
  const vp9 = v.canPlayType('video/webm; codecs="vp9"') !== "";
  // Safari: supports HEVC but not VP9
  if (hevc && !vp9) return PRESETS.find((p) => p.id === "browser-safari")!;
  return PRESETS.find((p) => p.id === "browser-chrome")!;
}

// ── Release quality parsing ────────────────────────────────────────────────

export interface ReleaseQuality {
  resolution?: "4K" | "1080p" | "720p" | "480p";
  video?: VideoCodec;
  audio?: AudioCodec;
  isHDR: boolean;
  isRemux: boolean;
}

export function parseRelease(title: string): ReleaseQuality {
  const t = title.toLowerCase();
  return {
    resolution:
      t.includes("2160p") || t.includes(".uhd.") || / 4k[\. ]/.test(t) ? "4K"
      : t.includes("1080p") ? "1080p"
      : t.includes("720p")  ? "720p"
      : t.includes("480p")  ? "480p"
      : undefined,

    video:
      t.includes("x265") || t.includes("h.265") || t.includes("hevc") || t.includes("hvc1") ? "hevc"
      : t.includes(".av1") || / av1[\. ]/.test(t) ? "av1"
      : t.includes("vp9") ? "vp9"
      : t.includes("x264") || t.includes("h.264") || t.includes(".avc.") || t.includes("xvid") ? "h264"
      : undefined,

    audio:
      t.includes("truehd") ? "truehd"
      : t.includes("dts-hd") || t.includes("dtshd") || t.includes("dts-x") || t.includes("dts:x") ? "dtshd"
      : t.includes("atmos") || t.includes("eac3") || t.includes("e-ac3") || / dd\+/.test(t) || t.includes("ddp") ? "eac3"
      : / dts[\. \-]/.test(t) || t.endsWith(".dts") ? "dts"
      : t.includes("ac3") || / dd5[\. ]/.test(t) ? "ac3"
      : t.includes("aac") ? "aac"
      : undefined,

    isHDR: t.includes("hdr") || t.includes("dv") || t.includes("dolby vision"),
    isRemux: t.includes("remux"),
  };
}

// ── Stream compatibility scoring ───────────────────────────────────────────

export type StreamCompat = "direct" | "transcode-audio" | "transcode-video";

export function streamCompat(q: ReleaseQuality, profile: DeviceProfile): StreamCompat {
  // Resolution: if the file is 4K but device tops out at 1080p → video transcode
  if (q.resolution === "4K" && profile.maxResolution !== "4K") return "transcode-video";

  // Video codec
  if (q.video && !profile.video.includes(q.video)) return "transcode-video";

  // Audio codec — DTS-HD and TrueHD have a backward-compatible core (DTS / AC3)
  const audioOk =
    !q.audio ||
    profile.audio.includes(q.audio) ||
    (q.audio === "dtshd" && profile.audio.includes("dts")) ||
    (q.audio === "truehd" && profile.audio.includes("ac3"));

  return audioOk ? "direct" : "transcode-audio";
}

export function scoreRelease(q: ReleaseQuality, profile: DeviceProfile): number {
  const c = streamCompat(q, profile);
  let score = c === "direct" ? 100 : c === "transcode-audio" ? 50 : 0;

  // Prefer the resolution that fills the device's screen
  if (q.resolution === profile.maxResolution) score += 20;
  else if (q.resolution === "1080p") score += 10;
  else if (q.resolution === "720p") score += 5;

  if (q.isRemux) score += 3; // slightly prefer remux quality

  return score;
}

// ── Title matching (Prowlarr release → Radarr movie) ──────────────────────

export function matchesTitle(releaseTitle: string, title: string, year: number): boolean {
  const rel = releaseTitle.toLowerCase();
  if (!rel.includes(String(year))) return false;
  const norm = (s: string) =>
    s.toLowerCase().replace(/^(the |a |an )/, "").replace(/[^a-z0-9]/g, "");
  const mov = norm(title);
  const relN = norm(rel);
  // Require at least the first 4 chars to match (handles short titles)
  return relN.includes(mov.slice(0, Math.max(4, mov.length)));
}
