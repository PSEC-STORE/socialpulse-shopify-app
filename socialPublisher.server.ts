import { Merchant, ScheduledPost } from "@prisma/client";

/**
 * Maps internal SocialPulse network IDs to unified Social API platform keys (Ayrshare / Upload-Post).
 * Covers all 14+ globally available social platforms in a single multi-tenant API call.
 */
const AYRSHARE_PLATFORM_MAP: Record<string, string> = {
  instagram: "instagram",
  facebook: "facebook",
  tiktok: "tiktok",
  linkedin: "linkedin",
  pinterest: "pinterest",
  x_twitter: "twitter",
  youtube_shorts: "youtube",
  threads: "threads",
  bluesky: "bluesky",
  reddit: "reddit",
  snapchat: "snapchat",
  telegram: "telegram",
  google_business: "gmb",
  tumblr: "tumblr",
};

export interface PublishOutcome {
  success: boolean;
  results: Record<string, { status: string; postUrl?: string; error?: string }>;
}

/**
 * Publishes a post (Product, Blog Article, Custom Media, or Rendered Animation Reel)
 * to all selected social platforms simultaneously via the Unified Social Publishing API.
 */
export async function publishToSocialNetworks(
  merchant: Merchant,
  post: ScheduledPost
): Promise<PublishOutcome> {
  const apiKey = process.env.AYRSHARE_API_KEY;
  const captions = (post.captionsJson || {}) as Record<string, string>;
  const mediaUrls = post.renderedVideoUrl
    ? [post.renderedVideoUrl]
    : post.mediaUrls;

  // Dry-run mode when API key is not configured yet (handy during local testing)
  if (!apiKey) {
    const simulated: Record<string, { status: string; postUrl?: string }> = {};
    for (const net of post.targetNetworks) {
      simulated[net] = {
        status: "SIMULATED_PUBLISHED",
        postUrl: `https://${net.replace("_", "")}.example.com/p/${post.id}`,
      };
    }
    return { success: true, results: simulated };
  }

  const results: Record<string, { status: string; postUrl?: string; error?: string }> = {};
  let anySuccess = false;

  // Send per-network so each network receives its own AI-tailored caption & UTM URL
  for (const network of post.targetNetworks) {
    const platform = AYRSHARE_PLATFORM_MAP[network];
    if (!platform) continue;

    const payload: Record<string, unknown> = {
      post: captions[network] || post.title,
      platforms: [platform],
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      isVideo: Boolean(post.renderedVideoUrl),
    };

    if (network === "youtube_shorts") {
      payload.youTubeOptions = { title: post.title.slice(0, 95), visibility: "public", shorts: true };
    }
    if (network === "pinterest" && post.destinationUrl) {
      payload.pinterestOptions = { title: post.title.slice(0, 95), link: post.destinationUrl };
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      if (merchant.socialProfileKey) {
        headers["Profile-Key"] = merchant.socialProfileKey;
      }

      const res = await fetch("https://api.ayrshare.com/api/post", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok && data.status !== "error") {
        anySuccess = true;
        results[network] = {
          status: "PUBLISHED",
          postUrl: data.postIds?.[0]?.postUrl || undefined,
        };
      } else {
        results[network] = {
          status: "FAILED",
          error: data.message || JSON.stringify(data),
        };
      }
    } catch (error: any) {
      results[network] = { status: "FAILED", error: error?.message || "Network error" };
    }
  }

  return { success: anySuccess, results };
}
