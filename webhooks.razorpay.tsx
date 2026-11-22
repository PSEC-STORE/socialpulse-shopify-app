import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import {
  handleRazorpayWebhookEvent,
  verifyRazorpayWebhookSignature,
} from "../services/razorpay.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") || "";

  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    return new Response("Invalid Razorpay webhook signature", { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const result = await handleRazorpayWebhookEvent(prisma, event);
  return Response.json(result);
};
