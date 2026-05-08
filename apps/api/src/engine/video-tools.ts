/**
 * Video utilities used by the video pipeline.
 *
 * Provides the three primitives that aren't part of the Seedance API itself:
 *   - downloadVideo: fetch the rendered mp4 from Seedance's CDN
 *   - extractLastFrame: pull the final frame out of a clip (used as the
 *     conditioning frame for the next clip when stitching 30 s outputs)
 *   - concatClips: glue 1+ clips into a single mp4 using the ffmpeg concat
 *     demuxer. Tries stream-copy first, falls back to re-encode if the inputs
 *     have differing codec parameters.
 *
 * ffmpeg is invoked via child_process.spawn against the ffmpeg-static binary
 * (no shell, args passed as array — no injection risk). Temp files live under
 * the OS temp dir and are always cleaned up in a finally block.
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

import { logger } from "../utils/logger.js";
import { ServiceUnavailableError } from "../utils/errors.js";

const FFMPEG_BIN: string = (() => {
  if (!ffmpegPath) {
    throw new Error(
      "ffmpeg-static did not provide a binary path — video features will not work"
    );
  }
  return ffmpegPath;
})();

// ─── Download ───────────────────────────────────────────────

/**
 * Download a video from a URL into memory. Used to fetch Seedance results
 * before re-uploading to Cloudinary.
 *
 * Bounded by maxBytes (default 200 MB) so a malicious/runaway response can't
 * exhaust the worker's heap.
 */
export async function downloadVideo(
  url: string,
  options: { maxBytes?: number; signal?: AbortSignal } = {}
): Promise<Buffer> {
  const maxBytes = options.maxBytes ?? 200 * 1024 * 1024;

  const response = await fetch(url, { signal: options.signal });
  if (!response.ok) {
    throw new ServiceUnavailableError(
      `Failed to download video (HTTP ${response.status})`
    );
  }

  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const declared = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new ServiceUnavailableError(
        `Video exceeds maximum size (${declared} > ${maxBytes} bytes)`
      );
    }
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > maxBytes) {
    throw new ServiceUnavailableError(
      `Video exceeds maximum size (${arrayBuffer.byteLength} > ${maxBytes} bytes)`
    );
  }
  return Buffer.from(arrayBuffer);
}

// ─── ffmpeg invocation ──────────────────────────────────────

interface RunFfmpegResult {
  exitCode: number | null;
  stderr: string;
}

function runFfmpeg(args: string[], signal?: AbortSignal): Promise<RunFfmpegResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    const stderrChunks: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    const onAbort = () => {
      child.kill("SIGKILL");
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", (err) => {
      signal?.removeEventListener("abort", onAbort);
      reject(err);
    });

    child.on("close", (code) => {
      signal?.removeEventListener("abort", onAbort);
      resolve({
        exitCode: code,
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    });
  });
}

/**
 * Make a fresh temp directory, run `fn` inside it, and remove it after —
 * even if `fn` throws.
 */
async function withTempDir<T>(
  prefix: string,
  fn: (dir: string) => Promise<T>
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {
      // Cleanup is best-effort — temp dir leaks aren't worth crashing for
    });
  }
}

// ─── Last-frame extraction ──────────────────────────────────

/**
 * Extract the final frame of a clip as a JPEG buffer.
 *
 * Uses `-sseof -0.1` (seek 0.1 s before EOF) + `-frames:v 1` so we don't
 * scan the whole file — important for 15 s clips at 1080p where a full
 * scan would be tens of MB of frame data.
 */
export async function extractLastFrame(
  videoBuffer: Buffer,
  options: { signal?: AbortSignal } = {}
): Promise<Buffer> {
  return withTempDir("seedance-frame-", async (dir) => {
    const inputPath = join(dir, "input.mp4");
    const outputPath = join(dir, "last.jpg");

    await writeFile(inputPath, videoBuffer);

    const { exitCode, stderr } = await runFfmpeg(
      [
        "-y",
        "-sseof", "-0.1",
        "-i", inputPath,
        "-frames:v", "1",
        "-q:v", "2",
        outputPath,
      ],
      options.signal
    );

    if (exitCode !== 0) {
      logger.error({ exitCode, stderr }, "ffmpeg extractLastFrame failed");
      throw new ServiceUnavailableError(
        `Failed to extract last frame (ffmpeg exit ${exitCode})`
      );
    }

    return readFile(outputPath);
  });
}

// ─── Concat ─────────────────────────────────────────────────

interface ClipProbe {
  durationSec: number;
  hasAudio: boolean;
}

/**
 * Probe a clip via the ffmpeg null muxer and parse its duration + whether
 * it contains an audio stream.
 *
 * `ffmpeg -i FILE -f null -` reports both via stderr, which is more portable
 * than relying on a separate ffprobe binary (ffmpeg-static doesn't always
 * ship one).
 */
async function probeClip(path: string, signal?: AbortSignal): Promise<ClipProbe> {
  const probe = await runFfmpeg(["-i", path, "-f", "null", "-"], signal);
  const durationMatch = probe.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!durationMatch) {
    throw new ServiceUnavailableError("Failed to read clip duration");
  }
  const hours = Number(durationMatch[1]);
  const minutes = Number(durationMatch[2]);
  const seconds = Number(durationMatch[3]);
  return {
    durationSec: hours * 3600 + minutes * 60 + seconds,
    // Match e.g. "Stream #0:1[0x2](und): Audio: aac (LC)"
    hasAudio: /Stream #\d+:\d+(\[[^\]]*\])?(\([^)]*\))?:\s*Audio:/.test(probe.stderr),
  };
}

/**
 * Crossfade clips together with a short overlap so the seam between them
 * is visually invisible.
 *
 * Re-encodes via the ffmpeg `xfade` filter — required because crossfade
 * cannot be done with stream-copy. Resulting video is slightly shorter than
 * the sum of inputs (overlap is consumed by the fade) but the cut becomes
 * imperceptible — which matters for 30s outputs stitched from two 15s clips.
 *
 * Audio handling: if EVERY input clip carries an audio stream, audio is
 * crossfaded in lockstep with video via `acrossfade`. If any clip is missing
 * audio (e.g., one returned silent from upstream), we render video-only — the
 * alternative would be silence inserts that sound worse than no audio.
 */
export async function crossfadeClips(
  clipBuffers: Buffer[],
  options: { fadeDurationSec?: number; signal?: AbortSignal } = {}
): Promise<Buffer> {
  const fadeDurationSec = options.fadeDurationSec ?? 0.4;

  if (clipBuffers.length === 0) {
    throw new Error("crossfadeClips: at least one clip is required");
  }
  if (clipBuffers.length === 1) {
    return clipBuffers[0];
  }

  return withTempDir("seedance-xfade-", async (dir) => {
    const clipPaths = await Promise.all(
      clipBuffers.map(async (buf, i) => {
        const path = join(dir, `clip${i}.mp4`);
        await writeFile(path, buf);
        return path;
      })
    );
    const outputPath = join(dir, "output.mp4");

    const probes = await Promise.all(
      clipPaths.map((p) => probeClip(p, options.signal))
    );
    const includeAudio = probes.every((p) => p.hasAudio);

    logger.info(
      {
        clipCount: clipPaths.length,
        includeAudio,
        durations: probes.map((p) => p.durationSec),
        hasAudio: probes.map((p) => p.hasAudio),
      },
      "Crossfade: prepared clips"
    );

    const inputArgs: string[] = [];
    for (const path of clipPaths) {
      inputArgs.push("-i", path);
    }

    // Build chained xfade filters for video. Offset of each fade is the
    // running duration of the accumulator minus the overlap, so the fade
    // begins exactly `fadeDurationSec` before the prior segment ends.
    const filterParts: string[] = [];
    let prevVideoLabel = "0:v";
    let runningDuration = probes[0].durationSec;
    for (let i = 1; i < clipPaths.length; i++) {
      const offset = Math.max(0, runningDuration - fadeDurationSec);
      const outLabel = i === clipPaths.length - 1 ? "outv" : `v${i}`;
      filterParts.push(
        `[${prevVideoLabel}][${i}:v]xfade=transition=fade:duration=${fadeDurationSec}:offset=${offset.toFixed(3)}[${outLabel}]`
      );
      prevVideoLabel = outLabel;
      runningDuration = runningDuration + probes[i].durationSec - fadeDurationSec;
    }

    // Mirror the same chain for audio with acrossfade. acrossfade overlaps
    // by `d` seconds at the END of the prior stream, so we don't need an
    // explicit offset like xfade — the filter handles alignment intrinsically.
    if (includeAudio) {
      let prevAudioLabel = "0:a";
      for (let i = 1; i < clipPaths.length; i++) {
        const outLabel = i === clipPaths.length - 1 ? "outa" : `a${i}`;
        filterParts.push(
          `[${prevAudioLabel}][${i}:a]acrossfade=d=${fadeDurationSec}[${outLabel}]`
        );
        prevAudioLabel = outLabel;
      }
    }

    const ffmpegArgs: string[] = [
      "-y",
      ...inputArgs,
      "-filter_complex", filterParts.join(";"),
      "-map", "[outv]",
    ];
    if (includeAudio) {
      ffmpegArgs.push("-map", "[outa]");
    }
    ffmpegArgs.push(
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      "-pix_fmt", "yuv420p"
    );
    if (includeAudio) {
      ffmpegArgs.push("-c:a", "aac", "-b:a", "192k");
    }
    ffmpegArgs.push("-movflags", "+faststart", outputPath);

    const { exitCode, stderr } = await runFfmpeg(ffmpegArgs, options.signal);

    if (exitCode !== 0) {
      logger.error(
        { exitCode, stderr: stderr.slice(-2_000), includeAudio },
        "ffmpeg crossfade failed"
      );
      throw new ServiceUnavailableError(
        `Failed to crossfade clips (ffmpeg exit ${exitCode})`
      );
    }

    return readFile(outputPath);
  });
}

/**
 * Concatenate clips (in order) into a single mp4.
 *
 * First attempts stream-copy via the concat demuxer (no re-encode — fast,
 * lossless). If that fails (e.g., clips have differing codec parameters),
 * falls back to re-encoding with libx264 + AAC, which always works at the
 * cost of one extra encode pass.
 *
 * Two clips of the same Seedance variant + resolution effectively always
 * stream-copy successfully, so the fallback is a safety net for edge cases.
 */
export async function concatClips(
  clipBuffers: Buffer[],
  options: { signal?: AbortSignal } = {}
): Promise<Buffer> {
  if (clipBuffers.length === 0) {
    throw new Error("concatClips: at least one clip is required");
  }
  if (clipBuffers.length === 1) {
    // Nothing to concat — pass through
    return clipBuffers[0];
  }

  return withTempDir("seedance-concat-", async (dir) => {
    // Write each clip + the concat manifest. Manifest entries use the
    // single-quoted `file 'name'` form — names are controlled by us
    // (clip0.mp4, clip1.mp4, ...), so there's no quote-escape risk.
    const clipPaths = await Promise.all(
      clipBuffers.map(async (buf, i) => {
        const path = join(dir, `clip${i}.mp4`);
        await writeFile(path, buf);
        return path;
      })
    );
    const manifestPath = join(dir, "manifest.txt");
    const manifest = clipPaths
      .map((p) => `file '${p.replace(/\\/g, "/")}'`)
      .join("\n");
    await writeFile(manifestPath, manifest);

    const outputPath = join(dir, "output.mp4");

    // First attempt: stream copy (no re-encode)
    const copyResult = await runFfmpeg(
      [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", manifestPath,
        "-c", "copy",
        "-movflags", "+faststart",
        outputPath,
      ],
      options.signal
    );

    if (copyResult.exitCode === 0) {
      return readFile(outputPath);
    }

    logger.warn(
      { exitCode: copyResult.exitCode, stderr: copyResult.stderr.slice(-2_000) },
      "Concat stream-copy failed; falling back to re-encode"
    );

    // Fallback: re-encode (handles mismatched parameters between clips)
    const encodeResult = await runFfmpeg(
      [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", manifestPath,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        outputPath,
      ],
      options.signal
    );

    if (encodeResult.exitCode !== 0) {
      logger.error(
        { exitCode: encodeResult.exitCode, stderr: encodeResult.stderr.slice(-2_000) },
        "ffmpeg concat re-encode failed"
      );
      throw new ServiceUnavailableError(
        `Failed to concatenate video clips (ffmpeg exit ${encodeResult.exitCode})`
      );
    }

    return readFile(outputPath);
  });
}
