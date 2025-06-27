
import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import { adminApp } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
if (!accessToken) {
    console.error("CRITICAL: MERCADOPAGO_ACCESS_TOKEN is not defined.");
}
const client = new MercadoPagoConfig({ accessToken: accessToken! });
const preapproval = new PreApproval(client);


export async function POST(request: NextRequest) {
  console.log("----- [WEBHOOK_START] Mercado Pago Webhook Received -----");
  console.log(`[WEBHOOK_INFO] Request received at: ${new Date().toISOString()}`);

  if (!adminApp) {
    console.error("[WEBHOOK_ERROR] CRITICAL: Firebase Admin SDK is not initialized.");
    return NextResponse.json({ success: false, message: 'Server configuration error.' }, { status: 500 });
  }
  
  let body;
  try {
    const requestText = await request.text();
    console.log("[WEBHOOK_INFO] Raw request body (as text):", `"${requestText}"`);
    if (!requestText) {
        console.warn("[WEBHOOK_WARN] Request body is empty.");
        return NextResponse.json({ success: false, message: 'Request body is empty.' }, { status: 400 });
    }
    body = JSON.parse(requestText);
    console.log("[WEBHOOK_INFO] Parsed Webhook Body:", JSON.stringify(body, null, 2));
  } catch (error) {
    console.error("[WEBHOOK_ERROR] Failed to parse request body as JSON:", error);
    return NextResponse.json({ success: false, message: 'Invalid JSON body.' }, { status: 400 });
  }

  try {
    const topic = body.topic || body.type;
    const preapprovalId = body.data?.id;

    console.log(`[WEBHOOK_INFO] Event Topic: '${topic}', Preapproval ID: '${preapprovalId}'`);

    if (topic !== 'preapproval' && topic !== 'subscription_preapproval' || !preapprovalId) {
        console.log("[WEBHOOK_IGNORE] Event is not a relevant preapproval event. Ignoring.");
        return NextResponse.json({ success: true, message: "Event ignored." });
    }

    console.log(`[WEBHOOK_FETCH] Fetching subscription details for preapproval ID: ${preapprovalId}...`);
    const subscription = await preapproval.get({ id: preapprovalId });
    
    console.log("[WEBHOOK_FETCH_SUCCESS] Full Subscription Details from MP:", JSON.stringify(subscription, null, 2));
    
    const status = subscription.status;
    const userId = subscription.external_reference; // Directly use the external_reference as the userId

    console.log(`[WEBHOOK_DATA] Status: '${status}', User ID (from external_reference): '${userId}'`);

    if (status === 'authorized') {
        console.log("[WEBHOOK_PROCESS] Status is 'authorized'. Proceeding to update user.");

        if (!userId) {
            console.error(`[WEBHOOK_ERROR] Fatal: external_reference (userId) is missing for preapproval ID: ${preapprovalId}. Cannot identify user.`);
            return NextResponse.json({ success: false, message: 'External reference (user ID) not found in subscription.' }, { status: 400 });
        }

        const db = adminApp.firestore();
        const userDocRef = db.collection('users').doc(userId);

        const subscriptionEndDate = new Date();
        subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);

        const subscriptionData = {
            subscriptionStatus: 'active' as const,
            subscriptionId: preapprovalId,
            subscriptionEndDate: Timestamp.fromDate(subscriptionEndDate),
            subscriptionProvider: 'MercadoPago',
            lastWebhookTimestamp: Timestamp.now(),
        };

        console.log(`[WEBHOOK_FIRESTORE] Attempting to set Firestore for user: ${userId} with data:`, JSON.stringify(subscriptionData, null, 2));

        await userDocRef.set(subscriptionData, { merge: true });
        
        console.log(`[WEBHOOK_SUCCESS] Firestore updated successfully for user ${userId}. Subscription is now active.`);

    } else {
        console.log(`[WEBHOOK_IGNORE] Subscription status is '${status}', not 'authorized'. No Firestore action taken for preapproval ID: ${preapprovalId}.`);
    }
    
    return NextResponse.json({ success: true, message: "Webhook processed." });

  } catch (error) {
    console.error("[WEBHOOK_ERROR] Unhandled error during webhook logic processing:", error);
    // @ts-ignore
    const errorMessage = error.message || 'Internal Server Error';
    return NextResponse.json({ success: false, message: errorMessage }, { status: 500 });
  }
}
