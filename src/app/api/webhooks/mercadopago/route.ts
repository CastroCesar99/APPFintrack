
import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, PreApproval, Payment } from 'mercadopago';
import { adminApp } from '@/lib/firebase-admin';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
if (!accessToken) {
    console.error("CRITICAL: MERCADOPAGO_ACCESS_TOKEN is not defined.");
}
const client = new MercadoPagoConfig({ accessToken: accessToken! });
const preapprovalClient = new PreApproval(client);
const paymentClient = new Payment(client);

async function updateUserSubscription(userId: string, preapprovalId: string, status: string) {
    if (!adminApp) {
        console.error("[WEBHOOK_ERROR] CRITICAL: Firebase Admin SDK is not initialized.");
        throw new Error("Server configuration error: Firebase Admin SDK not available.");
    }

    const db = getFirestore(adminApp);
    const userDocRef = db.collection('users').doc(userId);

    const subscriptionEndDate = new Date();
    subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);

    const subscriptionData = {
        subscriptionStatus: 'active' as const,
        subscriptionId: preapprovalId,
        subscriptionEndDate: Timestamp.fromDate(subscriptionEndDate),
        subscriptionProvider: 'MercadoPago',
        lastWebhookTimestamp: Timestamp.now(),
        lastKnownStatus: status,
    };

    console.log(`[WEBHOOK_FIRESTORE] Attempting to set Firestore for user: ${userId} with data:`, JSON.stringify(subscriptionData, null, 2));
    await userDocRef.set(subscriptionData, { merge: true });
    console.log(`[WEBHOOK_SUCCESS] Firestore updated successfully for user ${userId}. Subscription is now active.`);
}

export async function POST(request: NextRequest) {
  console.log("----- [WEBHOOK_START] Mercado Pago Webhook Received -----");
  
  let body: any;
  try {
    body = await request.json();
    console.log("[WEBHOOK_INFO] Parsed Webhook Body:", JSON.stringify(body, null, 2));
  } catch (e) {
    console.error("[WEBHOOK_ERROR] Failed to parse request body as JSON.", e);
    return NextResponse.json({ success: false, message: 'Invalid request body.' }, { status: 400 });
  }
  
  // Handle Mercado Pago's test notification
  if (body.data?.id === "123456") {
    console.log("[WEBHOOK_INFO] Test notification received and acknowledged.");
    return NextResponse.json({ success: true, message: "Test notification received." });
  }

  const eventType = body.type || body.topic;
  const dataId = body.data?.id;

  if (!eventType || !dataId) {
    console.log("[WEBHOOK_IGNORE] Event type or data ID is missing. Ignoring.", {eventType, dataId});
    return NextResponse.json({ success: true, message: "Event ignored, missing type or data.id." });
  }

  try {
    let userId: string | null = null;
    let preapprovalId: string | null = null;
    let finalStatus: string | null = null;

    if (eventType === 'preapproval' || eventType === 'subscription_preapproval') {
        console.log(`[WEBHOOK_PROCESS] Handling 'preapproval' event for ID: ${dataId}`);
        const subscription = await preapprovalClient.get({ id: dataId });
        console.log("[WEBHOOK_FETCH_SUCCESS] Full Preapproval Details:", JSON.stringify(subscription, null, 2));

        preapprovalId = dataId;
        finalStatus = subscription.status;
        // Prioritize the direct external_reference, which should be the clean userId
        userId = subscription.external_reference || null; 

    } else if (eventType === 'payment') {
        console.log(`[WEBHOOK_PROCESS] Handling 'payment' event for ID: ${dataId}`);
        const payment = await paymentClient.get({ id: dataId });
        console.log("[WEBHOOK_FETCH_SUCCESS] Full Payment Details:", JSON.stringify(payment, null, 2));
        
        if (payment.status === 'approved' && payment.preapproval_id) {
            preapprovalId = payment.preapproval_id;
            console.log(`[WEBHOOK_INFO] Payment approved. Fetching associated preapproval: ${preapprovalId}`);
            const subscription = await preapprovalClient.get({ id: preapprovalId });
            finalStatus = subscription.status;
            
            // Prioritize the direct external_reference from the subscription object
            userId = subscription.external_reference || null;
        } else {
            console.log(`[WEBHOOK_IGNORE] Payment status is '${payment.status}' or it's not linked to a preapproval. No action taken.`);
        }
    } else {
        console.log(`[WEBHOOK_IGNORE] Unhandled event type: '${eventType}'.`);
    }

    if (userId && preapprovalId && finalStatus) {
        if (finalStatus === 'authorized' || finalStatus === 'pending') {
            await updateUserSubscription(userId, preapprovalId, finalStatus);
        } else {
            console.log(`[WEBHOOK_IGNORE] Final subscription status is '${finalStatus}', not activating subscription.`);
        }
    } else {
        console.warn(`[WEBHOOK_WARN] Could not update subscription. Missing required info. UserID: ${userId}, PreapprovalID: ${preapprovalId}, Status: ${finalStatus}`);
    }


    console.log("----- [WEBHOOK_END] Processed successfully. -----");
    return NextResponse.json({ success: true, message: "Webhook processed." });

  } catch (error: any) {
    console.error("[WEBHOOK_ERROR] Unhandled error during webhook logic processing:", error);
    const errorMessage = error.message || 'Internal Server Error';
    return NextResponse.json({ success: false, message: errorMessage }, { status: 500 });
  }
}
