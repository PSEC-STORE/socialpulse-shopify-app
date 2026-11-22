import { PlanTier } from "@prisma/client";

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  tagline: string;
  priceUsdMonthly: number;
  priceInrMonthly: number;
  monthlyPostLimit: number;        // -1 = unlimited
  monthlyAnimationLimit: number;   // -1 = unlimited
  customMediaStorageMb: number;    // -1 = unlimited
  allowedNetworks: "ALL_GLOBAL";
  features: {
    aiCaptions: boolean;
    productAnimations: boolean;
    customMediaUpload: boolean;
    customWatermark: boolean;
    evergreenAutoRepost: boolean;
    stockAwarePause: boolean;
    autoUtmTracking: boolean;
    priorityQueue: boolean;
    ownerSuperAdmin: boolean;
  };
}

/**
 * All globally available social networks supported by SocialPulse Auto-Sync.
 * Available even on the FREE plan (up to 10 total scheduled/auto posts per month).
 */
export const GLOBAL_SOCIAL_NETWORKS = [
  { id: "instagram",       label: "Instagram (Feed & Reels)",     defaultRatio: "4:5",  supportsVideo: true,  supportsLink: false },
  { id: "facebook",        label: "Facebook Pages & Reels",       defaultRatio: "1:1",  supportsVideo: true,  supportsLink: true  },
  { id: "tiktok",          label: "TikTok",                       defaultRatio: "9:16", supportsVideo: true,  supportsLink: false },
  { id: "linkedin",        label: "LinkedIn (Pages & Profiles)",  defaultRatio: "1:1",  supportsVideo: true,  supportsLink: true  },
  { id: "pinterest",       label: "Pinterest Pins & Idea Pins",   defaultRatio: "2:3",  supportsVideo: true,  supportsLink: true  },
  { id: "x_twitter",       label: "X (Twitter)",                  defaultRatio: "16:9", supportsVideo: true,  supportsLink: true  },
  { id: "youtube_shorts",  label: "YouTube & Shorts",             defaultRatio: "9:16", supportsVideo: true,  supportsLink: true  },
  { id: "threads",         label: "Threads",                      defaultRatio: "4:5",  supportsVideo: true,  supportsLink: true  },
  { id: "bluesky",         label: "Bluesky",                      defaultRatio: "16:9", supportsVideo: true,  supportsLink: true  },
  { id: "reddit",          label: "Reddit Communities",           defaultRatio: "16:9", supportsVideo: true,  supportsLink: true  },
  { id: "snapchat",        label: "Snapchat Spotlight & Stories", defaultRatio: "9:16", supportsVideo: true,  supportsLink: true  },
  { id: "telegram",        label: "Telegram Channels",            defaultRatio: "1:1",  supportsVideo: true,  supportsLink: true  },
  { id: "google_business", label: "Google Business Profile",      defaultRatio: "4:3",  supportsVideo: false, supportsLink: true  },
  { id: "tumblr",          label: "Tumblr",                       defaultRatio: "1:1",  supportsVideo: true,  supportsLink: true  },
] as const;

export type SocialNetworkId = (typeof GLOBAL_SOCIAL_NETWORKS)[number]["id"];

export const PLANS: Record<PlanTier, PlanDefinition> = {
  OWNER_UNLIMITED: {
    tier: "OWNER_UNLIMITED",
    name: "Owner Unlimited (Psecstore)",
    tagline: "Full platform ownership & free unlimited access for Psecstore",
    priceUsdMonthly: 0,
    priceInrMonthly: 0,
    monthlyPostLimit: -1,
    monthlyAnimationLimit: -1,
    customMediaStorageMb: -1,
    allowedNetworks: "ALL_GLOBAL",
    features: {
      aiCaptions: true,
      productAnimations: true,
      customMediaUpload: true,
      customWatermark: true,
      evergreenAutoRepost: true,
      stockAwarePause: true,
      autoUtmTracking: true,
      priorityQueue: true,
      ownerSuperAdmin: true,
    },
  },
  FREE: {
    tier: "FREE",
    name: "Free Starter",
    tagline: "10 automated posts/month across all 14+ global social apps",
    priceUsdMonthly: 0,
    priceInrMonthly: 0,
    monthlyPostLimit: 10,
    monthlyAnimationLimit: 2,
    customMediaStorageMb: 100,
    allowedNetworks: "ALL_GLOBAL",
    features: {
      aiCaptions: true,
      productAnimations: true,
      customMediaUpload: true,
      customWatermark: false,
      evergreenAutoRepost: false,
      stockAwarePause: true,
      autoUtmTracking: true,
      priorityQueue: false,
      ownerSuperAdmin: false,
    },
  },
  STARTER: {
    tier: "STARTER",
    name: "Starter",
    tagline: "For growing Shopify brands automating daily product & blog drops",
    priceUsdMonthly: 19,
    priceInrMonthly: 1499,
    monthlyPostLimit: 100,
    monthlyAnimationLimit: 20,
    customMediaStorageMb: 2048,
    allowedNetworks: "ALL_GLOBAL",
    features: {
      aiCaptions: true,
      productAnimations: true,
      customMediaUpload: true,
      customWatermark: true,
      evergreenAutoRepost: false,
      stockAwarePause: true,
      autoUtmTracking: true,
      priorityQueue: false,
      ownerSuperAdmin: false,
    },
  },
  GROWTH: {
    tier: "GROWTH",
    name: "Growth",
    tagline: "Full-scale omnichannel automation with HD product reels & evergreen recycling",
    priceUsdMonthly: 49,
    priceInrMonthly: 3999,
    monthlyPostLimit: 500,
    monthlyAnimationLimit: 100,
    customMediaStorageMb: 15360,
    allowedNetworks: "ALL_GLOBAL",
    features: {
      aiCaptions: true,
      productAnimations: true,
      customMediaUpload: true,
      customWatermark: true,
      evergreenAutoRepost: true,
      stockAwarePause: true,
      autoUtmTracking: true,
      priorityQueue: true,
      ownerSuperAdmin: false,
    },
  },
  PRO_AGENCY: {
    tier: "PRO_AGENCY",
    name: "Pro & Agency",
    tagline: "Unlimited posts, unlimited showcase animations & custom branding",
    priceUsdMonthly: 119,
    priceInrMonthly: 9999,
    monthlyPostLimit: -1,
    monthlyAnimationLimit: -1,
    customMediaStorageMb: 102400,
    allowedNetworks: "ALL_GLOBAL",
    features: {
      aiCaptions: true,
      productAnimations: true,
      customMediaUpload: true,
      customWatermark: true,
      evergreenAutoRepost: true,
      stockAwarePause: true,
      autoUtmTracking: true,
      priorityQueue: true,
      ownerSuperAdmin: false,
    },
  },
};
