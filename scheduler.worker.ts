import { PostStatus } from "@prisma/client";
import prisma from "../db.server";
import { checkPostQuota } from "../services/billing.server";
import { renderProductAnimation } from "../services/animationEngine.server";
import { publishToSocialNetworks } from "../services/socialPublisher.server";

/**
 * Background Automation Worker — runs on a 60-second heartbeat (or BullMQ repeatable job).
 * 1. Finds all QUEUED posts whose `scheduledFor <= now`.
 * 2. Verifies merchant quota (automatically bypassed for Owner: psecstore@gmail.com).
 * 3. Renders product showcase animation via FFmpeg if an AnimationPreset was chosen.
 * 4. Publishes simultaneously to all selected social networks.
 * 5. Increments usage counter for non-owner customer stores.
 */
export async function processDuePosts() {
  const now = new Date();
  const duePosts = await prisma.scheduledPost.findMany({
    where: {
      status: PostStatus.QUEUED,
      scheduledFor: { lte: now },
    },
    include: { merchant: true },
    orderBy: { scheduledFor: "asc" },
    take: 25,
  });

  for (const post of duePosts) {
    const merchant = post.merchant;
    if (!merchant.automationEnabled) continue;

    // 1. Quota check (Psecstore / psecstore@gmail.com is always UNLIMITED)
    const quota = await checkPostQuota(prisma, merchant);
    if (!quota.allowed) {
      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: { status: PostStatus.FAILED, errorMessage: quota.reason },
      });
      continue;
    }

    try {
      let renderedVideoUrl = post.renderedVideoUrl;

      // 2. Render Product Showcase Animation if requested and not yet rendered
      if (post.animationPreset !== "NONE" && !renderedVideoUrl && post.mediaUrls.length > 0) {
        await prisma.scheduledPost.update({
          where: { id: post.id },
          data: { status: PostStatus.RENDERING_VIDEO },
        });

        renderedVideoUrl = await renderProductAnimation({
          jobId: post.id,
          preset: post.animationPreset,
          inputImageUrls: post.mediaUrls,
          aspectRatio: post.targetNetworks.some((n) => ["tiktok", "youtube_shorts", "snapchat"].includes(n))
            ? "9:16"
            : "1:1",
          overlayTitle: post.customOverlayText || post.title,
          priceBadgeText: post.priceDisplay || undefined,
          ctaText: "Shop Now",
          watermarkUrl: post.applyWatermark ? merchant.watermarkLogoUrl || undefined : undefined,
          brandColor: merchant.brandPrimaryColor,
        });

        await prisma.scheduledPost.update({
          where: { id: post.id },
          data: { renderedVideoUrl },
        });
      }

      // 3. Publish to all selected global social platforms
      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: { status: PostStatus.PUBLISHING },
      });

      const outcome = await publishToSocialNetworks(merchant, {
        ...post,
        renderedVideoUrl,
      });

      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: {
          status: outcome.success ? PostStatus.PUBLISHED : PostStatus.FAILED,
          publishedAt: outcome.success ? new Date() : null,
          platformResults: outcome.results as any,
        },
      });

      // 4. Increment customer usage count (never count against Psecstore owner)
      if (outcome.success && !merchant.isOwner) {
        await prisma.merchant.update({
          where: { id: merchant.id },
          data: {
            postsUsedThisMonth: { increment: 1 },
            ...(post.animationPreset !== "NONE" ? { animationsUsedThisMonth: { increment: 1 } } : {}),
          },
        });
      }
    } catch (err: any) {
      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: {
          status: PostStatus.FAILED,
          errorMessage: err?.message || "Unexpected worker error",
          retryCount: { increment: 1 },
        },
      });
    }
  }
}

// Run standalone worker loop when invoked via `npm run worker`
if (process.argv[1]?.includes("scheduler.worker")) {
  console.log("[SocialPulse Worker] Started automated scheduler (Owner: Psecstore)...");
  setInterval(() => {
    processDuePosts().catch((err) => console.error("[Worker Error]", err));
  }, 60_000);
  processDuePosts().catch((err) => console.error("[Worker Initial Run Error]", err));
}
