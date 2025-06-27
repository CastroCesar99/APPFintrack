
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
  console.log(`[WEBHOOK_INFO] Request URL: ${request.url}`);
  
  if (!adminApp) {
    console.error("[WEBHOOK_ERROR] CRITICAL: Firebase Admin SDK is not initialized.");
    return NextResponse.json({ success: false, message: 'Server configuration error.' }, { status: 500 });
  }
  
  let body: any = {};
  let preapprovalId: string | null = null;
  const searchParams = request.nextUrl.searchParams;

  try {
    const requestText = await request.text();
    console.log("[WEBHOOK_INFO] Raw request body (as text):", `"${requestText}"`);
    if (requestText) {
      body = JSON.parse(requestText);
      console.log("[WEBHOOK_INFO] Parsed Webhook Body:", JSON.stringify(body, null, 2));
    } else {
      console.log("[WEBHOOK_INFO] Request body is empty.");
    }

    // Attempt to get ID from multiple possible locations
    const topic = body.topic || body.type || searchParams.get('topic') || searchParams.get('type');
    preapprovalId = body.data?.id || searchParams.get('data.id') || searchParams.get('id');
    
    console.log(`[WEBHOOK_DATA_EXTRACTION] Topic: '${topic}', Extracted Preapproval ID: '${preapprovalId}'`);

    if ( (topic !== 'preapproval' && topic !== 'subscription_preapproval') || !preapprovalId) {
        console.log("[WEBHOOK_IGNORE] Event is not a relevant preapproval event or ID is missing. Ignoring.");
        return NextResponse.json({ success: true, message: "Event ignored as it's not a relevant subscription approval." });
    }

    console.log(`[WEBHOOK_FETCH] Fetching subscription details for preapproval ID: ${preapprovalId}...`);
    const subscription = await preapproval.get({ id: preapprovalId });
    
    console.log("[WEBHOOK_FETCH_SUCCESS] Full Subscription Details from MP:", JSON.stringify(subscription, null, 2));
    
    const status = subscription.status;
    const userId = subscription.external_reference; 

    console.log(`[WEBHOOK_DATA_VALIDATION] Subscription Status: '${status}', User ID (from external_reference): '${userId}'`);

    if (status === 'authorized') {
        console.log("[WEBHOOK_PROCESS] Status is 'authorized'. Proceeding to update user in Firestore.");

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
    
    console.log("----- [WEBHOOK_END] Processed successfully. -----");
    return NextResponse.json({ success: true, message: "Webhook processed." });

  } catch (error: any) {
    console.error("[WEBHOOK_ERROR] Unhandled error during webhook logic processing:", error);
    const errorMessage = error.message || 'Internal Server Error';
    return NextResponse.json({ success: false, message: errorMessage }, { status: 500 });
  }
}
