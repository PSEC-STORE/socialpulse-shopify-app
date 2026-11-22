import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import ffmpeg from "fluent-ffmpeg";
import { AnimationPreset } from "@prisma/client";

export interface AnimationRenderRequest {
  jobId: string;
  preset: AnimationPreset;
  inputImageUrls: string[];
  aspectRatio: "9:16" | "1:1" | "16:9";
  overlayTitle?: string;
  priceBadgeText?: string;
  ctaText?: string;
  watermarkUrl?: string;
  brandColor?: string;
  durationSeconds?: number;
}

const DIMENSIONS: Record<string, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 }, // TikTok, IG Reels, YouTube Shorts, Snapchat
  "1:1":  { w: 1080, h: 1080 }, // Instagram Feed, Facebook, LinkedIn, Threads
  "16:9": { w: 1920, h: 1080 }, // YouTube, X (Twitter), Bluesky, Reddit
};

function escapeDrawtext(text: string): string {
  return text.replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/**
 * Generates an MP4 product showcase animation from Shopify product photos or custom uploaded media.
 * Requires `ffmpeg` binary installed on the host container (included in Dockerfile).
 */
export async function renderProductAnimation(req: AnimationRenderRequest): Promise<string> {
  if (!req.inputImageUrls.length) {
    throw new Error("At least one product or custom image is required to render an animation.");
  }

  const dim = DIMENSIONS[req.aspectRatio] || DIMENSIONS["9:16"];
  const duration = req.durationSeconds || 8;
  const fps = 30;
  const totalFrames = duration * fps;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `sp-anim-${req.jobId}-`));
  const outputPath = path.join(tmpDir, `${req.jobId}.mp4`);

  // Download primary source image locally for FFmpeg processing
  const primaryImagePath = path.join(tmpDir, "source_0.jpg");
  const imgResp = await fetch(req.inputImageUrls[0]);
  if (!imgResp.ok) throw new Error(`Failed to fetch source image: ${req.inputImageUrls[0]}`);
  await fs.writeFile(primaryImagePath, Buffer.from(await imgResp.arrayBuffer()));

  // Build preset-specific FFmpeg video filter chain
  const filters: string[] = [];

  switch (req.preset) {
    case "KEN_BURNS_ZOOM":
      filters.push(
        `scale=${dim.w * 2}:${dim.h * 2}:force_original_aspect_ratio=increase`,
        `crop=${dim.w * 2}:${dim.h * 2}`,
        `zoompan=z='min(zoom+0.0015,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${dim.w}x${dim.h}:fps=${fps}`
      );
      break;

    case "SPOTLIGHT_LUXURY":
      filters.push(
        `scale=${dim.w}:${dim.h}:force_original_aspect_ratio=increase`,
        `crop=${dim.w}:${dim.h}`,
        `vignette=PI/4`,
        `fade=t=in:st=0:d=1.2`,
        `fade=t=out:st=${Math.max(1, duration - 1)}:d=1`
      );
      break;

    case "FLASH_SALE_PULSE":
      filters.push(
        `scale=${dim.w * 2}:${dim.h * 2}:force_original_aspect_ratio=increase`,
        `crop=${dim.w * 2}:${dim.h * 2}`,
        `zoompan=z='1.05+0.08*abs(sin(on/10))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${dim.w}x${dim.h}:fps=${fps}`
      );
      break;

    case "PRICE_BADGE_POP":
    case "SLIDE_CAROUSEL_REEL":
    default:
      filters.push(
        `scale=${dim.w * 2}:${dim.h * 2}:force_original_aspect_ratio=increase`,
        `crop=${dim.w * 2}:${dim.h * 2}`,
        `zoompan=z='min(zoom+0.001,1.15)':x='(iw-iw/zoom)*on/${totalFrames}':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${dim.w}x${dim.h}:fps=${fps}`
      );
      break;
  }

  // Optional Title Overlay
  if (req.overlayTitle) {
    const title = escapeDrawtext(req.overlayTitle.slice(0, 48));
    filters.push(
      `drawbox=x=0:y=${Math.round(dim.h * 0.72)}:w=${dim.w}:h=${Math.round(dim.h * 0.22)}:color=black@0.55:t=fill`,
      `drawtext=text='${title}':fontcolor=white:fontsize=54:x=(w-text_w)/2:y=${Math.round(dim.h * 0.76)}`
    );
  }

  // Optional Animated Price Badge Overlay
  if (req.priceBadgeText) {
    const price = escapeDrawtext(req.priceBadgeText);
    const badgeColor = (req.brandColor || "#008060").replace("#", "0x");
    filters.push(
      `drawbox=x=${Math.round(dim.w * 0.08)}:y=${Math.round(dim.h * 0.08)}:w=360:h=110:color=${badgeColor}@0.92:t=fill`,
      `drawtext=text='${price}':fontcolor=white:fontsize=48:x=${Math.round(dim.w * 0.11)}:y=${Math.round(dim.h * 0.105)}`
    );
  }

  // Optional CTA Overlay
  if (req.ctaText) {
    const cta = escapeDrawtext(req.ctaText.slice(0, 40));
    filters.push(
      `drawtext=text='${cta}':fontcolor=yellow:fontsize=40:x=(w-text_w)/2:y=${Math.round(dim.h * 0.86)}`
    );
  }

  await new Promise<void>((resolve, reject) => {
    ffmpeg(primaryImagePath)
      .loop(duration)
      .videoFilters(filters)
      .outputOptions([
        "-c:v libx264",
        "-pix_fmt yuv420p",
        "-movflags +faststart",
        `-t ${duration}`,
        `-r ${fps}`,
      ])
      .save(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err));
  });

  // In production, upload `outputPath` to Cloudflare R2 / AWS S3 and return the public HTTPS URL.
  // For local/starter setups, return the public URL convention:
  const publicBase = process.env.MEDIA_STORAGE_PUBLIC_URL || "https://media.psecstore.com";
  return `${publicBase}/animations/${req.jobId}.mp4`;
}
