
"use server";

import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import { adminApp } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// Initialize Mercado Pago SDK
// It's safer to check for the existence of the env var before initializing
const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
if (!accessToken) {
    console.error("CRITICAL: MERCADOPAGO_ACCESS_TOKEN is not defined.");
}
const client = new MercadoPagoConfig({ accessToken: accessToken! });
const preapproval = new PreApproval(client);

// In a real production app, you would verify the webhook signature.
// For this example, we assume it's valid.

export async function POST(request: NextRequest) {
  console.log("----- [WEBHOOK_START] Mercado Pago Webhook Received -----");

  if (!adminApp) {
    console.error("[WEBHOOK_ERROR] CRITICAL: Firebase Admin SDK is not initialized. Cannot process webhook.");
    return NextResponse.json({ success: false, message: 'Server configuration error.' }, { status: 500 });
  }

  try {
    const body = await request.json();
    console.log("[WEBHOOK_INFO] Raw Webhook Body:", JSON.stringify(body, null, 2));

    const topic = body.topic || body.type;
    const preapprovalId = body.data?.id;

    console.log(`[WEBHOOK_INFO] Event Topic: '${topic}', Preapproval ID: '${preapprovalId}'`);

    if (topic !== 'preapproval' || !preapprovalId) {
        console.log("[WEBHOOK_IGNORE] Event is not a relevant preapproval event. Ignoring.");
        return NextResponse.json({ success: true, message: "Event ignored." });
    }

    console.log(`[WEBHOOK_FETCH] Fetching subscription details for preapproval ID: ${preapprovalId}...`);
    const subscription = await preapproval.get({ id: preapprovalId });
    
    console.log("[WEBHOOK_FETCH_SUCCESS] Full Subscription Details from MP:", JSON.stringify(subscription, null, 2));
    
    const status = subscription.status;
    const externalReference = subscription.external_reference;

    console.log(`[WEBHOOK_DATA] Status: '${status}', External Reference: '${externalReference}'`);

    if (status === 'authorized') {
        console.log("[WEBHOOK_PROCESS] Status is 'authorized'. Proceeding to update user.");

        if (!externalReference) {
            console.error(`[WEBHOOK_ERROR] Fatal: external_reference is missing for preapproval ID: ${preapprovalId}. Cannot identify user.`);
            return NextResponse.json({ success: false, message: 'External reference (user ID) not found in subscription.' }, { status: 400 });
        }

        // --- SIMPLIFIED LOGIC ---
        // The external_reference should directly be the user's UID as sent from the subscription page.
        const userId = externalReference;
        console.log(`[WEBHOOK_INFO] Using external_reference directly as userId: '${userId}'`);
        // --- END OF SIMPLIFIED LOGIC ---

        const db = adminApp.firestore();
        const userDocRef = db.collection('users').doc(userId);

        const subscriptionEndDate = new Date();
        subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1); // Set subscription for 1 month

        const subscriptionData = {
            subscriptionStatus: 'active' as const,
            subscriptionId: preapprovalId,
            subscriptionEndDate: Timestamp.fromDate(subscriptionEndDate),
            subscriptionProvider: 'MercadoPago',
            lastWebhookTimestamp: Timestamp.now(),
        };

        console.log(`[WEBHOOK_FIRESTORE] Attempting to update Firestore for user: ${userId} with data:`, JSON.stringify(subscriptionData, null, 2));

        await userDocRef.set(subscriptionData, { merge: true });
        
        console.log(`[WEBHOOK_SUCCESS] Firestore updated successfully for user ${userId}. Subscription is now active.`);

    } else {
        console.log(`[WEBHOOK_IGNORE] Subscription status is '${status}', not 'authorized'. No Firestore action taken for preapproval ID: ${preapprovalId}.`);
    }
    
    return NextResponse.json({ success: true, message: "Webhook processed." });

  } catch (error) {
    console.error("[WEBHOOK_ERROR] Unhandled error in webhook processing:", error);
    // @ts-ignore
    const errorMessage = error.message || 'Internal Server Error';
    return NextResponse.json({ success: false, message: errorMessage }, { status: 500 });
  }
}
