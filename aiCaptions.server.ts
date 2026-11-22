import { GoogleGenAI } from "@google/genai";
import { GLOBAL_SOCIAL_NETWORKS, SocialNetworkId } from "../config/plans.server";

export interface CaptionGenerationInput {
  sourceType: "SHOPIFY_PRODUCT" | "SHOPIFY_BLOG" | "CUSTOM_MEDIA";
  title: string;
  description: string;
  priceDisplay?: string;
  destinationUrl?: string;
  brandVoice: string;
  defaultHashtags: string;
  networks: SocialNetworkId[];
  utmParams?: { source: string; medium: string; campaign: string };
}

export function buildTrackedUrl(
  baseUrl?: string,
  utm?: { source: string; medium: string; campaign: string },
  network?: string
): string {
  if (!baseUrl) return "";
  try {
    const url = new URL(baseUrl);
    if (utm?.source) url.searchParams.set("utm_source", network || utm.source);
    if (utm?.medium) url.searchParams.set("utm_medium", utm.medium);
    if (utm?.campaign) url.searchParams.set("utm_campaign", utm.campaign);
    return url.toString();
  } catch {
    return baseUrl;
  }
}

/**
 * Uses Gemini to tailor one Shopify Product or Blog Post into native copy for every selected
 * social network (respecting X's 280-char limit, IG/TikTok link-in-bio rules, LinkedIn
 * professional tone, Pinterest SEO keywords, etc.).
 */
export async function generatePlatformCaptions(
  input: CaptionGenerationInput
): Promise<Record<string, string>> {
  const apiKey = process.env.GEMINI_API_KEY;
  const fallbackCaptions: Record<string, string> = {};

  for (const net of input.networks) {
    const meta = GLOBAL_SOCIAL_NETWORKS.find((n) => n.id === net);
    const trackedUrl = buildTrackedUrl(input.destinationUrl, input.utmParams, net);
    const cta = meta?.supportsLink && trackedUrl ? `\nShop / Read now: ${trackedUrl}` : "\nLink in bio!";
    const priceLine = input.priceDisplay ? ` — ${input.priceDisplay}` : "";
    fallbackCaptions[net] = `${input.title}${priceLine}\n\n${input.description.slice(0, 140)}${cta}\n\n${input.defaultHashtags}`;
  }

  if (!apiKey) return fallbackCaptions;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
You are an expert e-commerce social media manager.
Generate tailored, ready-to-publish captions as strict JSON where keys are the network IDs: ${JSON.stringify(input.networks)}.
Content Type: ${input.sourceType}
Title: ${input.title}
Price: ${input.priceDisplay || "N/A"}
Details: ${input.description.slice(0, 800)}
Brand Voice: ${input.brandVoice}
Base Hashtags: ${input.defaultHashtags}
URL: ${input.destinationUrl || "N/A"}

Rules:
- instagram & tiktok: engaging hook, emojis, "Link in bio" instead of raw URL, relevant hashtags.
- x_twitter & bluesky: concise under 260 chars including tracked link.
- linkedin: value-driven, polished storytelling, CTA link at the end.
- pinterest: keyword-rich SEO description for product discovery.
- youtube_shorts & snapchat: punchy short-form video hook + CTA.
- reddit: authentic, non-spammy community tone.
- Return ONLY a valid JSON object mapping each network ID to its caption string.
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    const parsed = JSON.parse(response.text || "{}");
    const finalCaptions: Record<string, string> = {};
    for (const net of input.networks) {
      const trackedUrl = buildTrackedUrl(input.destinationUrl, input.utmParams, net);
      const text = parsed[net] || fallbackCaptions[net];
      finalCaptions[net] = input.destinationUrl && trackedUrl
        ? text.replaceAll(input.destinationUrl, trackedUrl)
        : text;
    }
    return finalCaptions;
  } catch (err) {
    console.error("[AI Captions] Falling back to template:", err);
    return fallbackCaptions;
  }
}
