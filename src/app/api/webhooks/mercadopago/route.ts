
import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, PreApproval, Payment } from 'mercadopago';
import { adminApp } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

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
        throw new Error("Server configuration error.");
    }

    const db = adminApp.firestore();
    // Firebase Admin SDK uses a different syntax for document paths
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

  const eventType = body.type || body.topic;
  const dataId = body.data?.id;

  if (!eventType || !dataId) {
    console.log("[WEBHOOK_IGNORE] Event type or data ID is missing. Ignoring.", {eventType, dataId});
    return NextResponse.json({ success: true, message: "Event ignored, missing type or data.id." });
  }

  try {
    if (eventType === 'preapproval' || eventType === 'subscription_preapproval') {
        console.log(`[WEBHOOK_PROCESS] Handling 'preapproval' event for ID: ${dataId}`);
        const subscription = await preapprovalClient.get({ id: dataId });
        console.log("[WEBHOOK_FETCH_SUCCESS] Full Preapproval Details:", JSON.stringify(subscription, null, 2));

        const userId = subscription.external_reference;
        const status = subscription.status;

        if (!userId) {
            console.error(`[WEBHOOK_ERROR] Fatal: external_reference (userId) is missing for preapproval ID: ${dataId}.`);
            return NextResponse.json({ success: false, message: 'External reference not found in preapproval.' }, { status: 400 });
        }
        
        if (status === 'authorized' || status === 'pending') {
            await updateUserSubscription(userId, dataId, status);
        } else {
            console.log(`[WEBHOOK_IGNORE] Preapproval status is '${status}', not activating subscription.`);
        }

    } else if (eventType === 'payment') {
        console.log(`[WEBHOOK_PROCESS] Handling 'payment' event for ID: ${dataId}`);
        const payment = await paymentClient.get({ id: dataId });
        console.log("[WEBHOOK_FETCH_SUCCESS] Full Payment Details:", JSON.stringify(payment, null, 2));
        
        const preapprovalId = payment.preapproval_id;

        if (payment.status === 'approved' && preapprovalId) {
            console.log(`[WEBHOOK_INFO] Payment approved. Fetching associated preapproval: ${preapprovalId}`);
            const subscription = await preapprovalClient.get({ id: preapprovalId });
            const userId = subscription.external_reference;
            const subStatus = subscription.status;

            if (!userId) {
                console.error(`[WEBHOOK_ERROR] Fatal: external_reference (userId) is missing for preapproval ID: ${preapprovalId} linked from payment ${dataId}.`);
                return NextResponse.json({ success: false, message: 'External reference not found in associated preapproval.' }, { status: 400 });
            }

            if (subStatus === 'authorized' || subStatus === 'pending') {
                await updateUserSubscription(userId, preapprovalId, subStatus);
            } else {
                 console.log(`[WEBHOOK_IGNORE] Linked preapproval status is '${subStatus}', not activating subscription.`);
            }
        } else {
            console.log(`[WEBHOOK_IGNORE] Payment status is '${payment.status}' or it's not linked to a preapproval. No action taken.`);
        }
    } else {
        console.log(`[WEBHOOK_IGNORE] Unhandled event type: '${eventType}'.`);
    }

    console.log("----- [WEBHOOK_END] Processed successfully. -----");
    return NextResponse.json({ success: true, message: "Webhook processed." });

  } catch (error: any) {
    console.error("[WEBHOOK_ERROR] Unhandled error during webhook logic processing:", error);
    const errorMessage = error.message || 'Internal Server Error';
    return NextResponse.json({ success: false, message: errorMessage }, { status: 500 });
  }
}
