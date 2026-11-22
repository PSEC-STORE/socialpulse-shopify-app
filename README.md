# SocialPulse Auto-Sync by Psecstore

Full-stack Shopify App that automatically syncs **Shopify Products**, **Blog Posts**, **Custom Uploaded Media**, and **FFmpeg-Generated Product Showcase Animations** to **14+ global social media platforms** with AI-tailored captions, smart drip scheduling, and built-in monetization.

## Owner Configuration
- **Owner Organization:** Psecstore
- **Owner Email:** `psecstore@gmail.com`
- **Owner Privileges:** Automatic lifetime **FREE Unlimited Access** to all plans, zero quotas, and exclusive access to `/app/owner` (Super-Admin Console).

## Supported Global Social Networks (14+)
Instagram (Feed & Reels), Facebook Pages & Reels, TikTok, LinkedIn, Pinterest, X (Twitter), YouTube & Shorts, Threads, Bluesky, Reddit, Snapchat, Telegram, Google Business Profile, and Tumblr.

## Pricing Structure
- **Owner (`psecstore@gmail.com`)**: Unlimited everything — **$0 / ₹0 forever**
- **Free Plan**: **10 posts/month** across all 14+ networks, 2 animations/mo, 100 MB custom media
- **Starter ($19/mo or ₹1,499/mo)**: 100 posts/month, 20 animations/mo, 2 GB custom media, brand watermark
- **Growth ($49/mo or ₹3,999/mo)**: 500 posts/month, 100 animations/mo, 15 GB media, evergreen auto-repost
- **Pro & Agency ($119/mo or ₹9,999/mo)**: Unlimited posts & animations, 100 GB media, priority queue

## Quick Start
1. Copy `.env.example` to `.env` and fill in your credentials (`OWNER_EMAIL=psecstore@gmail.com` is already set).
2. Run `npm install`
3. Run `npx prisma db push`
4. Run `shopify app dev` (connect to your Shopify Partner account under `psecstore@gmail.com`)
5. Start the background scheduler & animation worker in a second terminal: `npm run worker`

## Critical Billing Compliance Note (Shopify App Store vs. Razorpay)
- **Shopify App Store (Public App):** Shopify requires all public apps listed on the Shopify App Store to bill via **Shopify App Pricing** (Managed Pricing in Partner Dashboard) or the **Shopify Billing API** (`app/services/billing.server.ts`). Shopify offers **0% revenue share on your first $1,000,000 USD/year** when you register your Partner account for the reduced revenue share plan.
- **Razorpay (`app/services/razorpay.server.ts`):** Ready to collect INR/UPI/Card recurring subscriptions from **direct web SaaS clients, agency retainer clients, and custom-app installations** outside the Shopify App Store. Do NOT enable `ENABLE_RAZORPAY_DIRECT=true` inside the public Shopify App Store build during review.
