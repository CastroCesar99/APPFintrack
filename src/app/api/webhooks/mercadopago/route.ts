
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

async function updateUserSubscription(userId: string, preapprovalId: string, status: string, nextPaymentDateStr?: string | null) {
    console.log(`[WEBHOOK_ACTION_START] Attempting subscription update for user: ${userId}`);
    if (!adminApp) {
        console.error("[WEBHOOK_ERROR] CRITICAL: Firebase Admin SDK is not initialized. Cannot update subscription.");
        throw new Error("Server configuration error: Firebase Admin SDK not available.");
    }

    try {
        const db = getFirestore(adminApp);
        const userDocRef = db.collection('users').doc(userId);

        // Set a default end date of 1 month from now if nextPaymentDate is not available or invalid
        let subscriptionEndDate = new Date();
        subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);
        
        // Try to parse the next payment date from Mercado Pago if it exists
        if (nextPaymentDateStr) {
            try {
                // MP sometimes sends YYYY/MM/DD, sometimes ISO. Be flexible.
                const parsedDate = new Date(nextPaymentDateStr.replace(/\//g, '-'));
                if (!isNaN(parsedDate.getTime())) {
                    subscriptionEndDate = parsedDate;
                }
            } catch(e) {
                console.warn(`Could not parse next_payment_date '${nextPaymentDateStr}'. Defaulting to 1 month from now.`);
            }
        }
        
        const subscriptionData = {
            subscriptionStatus: 'active' as const,
            subscriptionId: preapprovalId,
            subscriptionEndDate: Timestamp.fromDate(subscriptionEndDate),
            subscriptionProvider: 'MercadoPago',
            lastWebhookTimestamp: Timestamp.now(),
            lastKnownStatus: status,
        };

        console.log(`[WEBHOOK_FIRESTORE] Attempting to set Firestore for user: ${userId} with data:`, JSON.stringify(subscriptionData, null, 2));
        await userDocRef.set({ ...subscriptionData }, { merge: true });
        console.log(`[WEBHOOK_SUCCESS] Firestore updated successfully for user ${userId}. Subscription is now active.`);
    } catch (dbError) {
        console.error(`[WEBHOOK_FIRESTORE_ERROR] Failed to update Firestore for user ${userId}. Error:`, dbError);
        throw dbError; // Re-throw to be caught by the main handler
    }
}

export async function POST(request: NextRequest) {
  console.log("----- [WEBHOOK_START] Mercado Pago Webhook Received -----");
  
  try {
    const body = await request.json();
    console.log("[WEBHOOK_INFO] Parsed Webhook Body:", JSON.stringify(body, null, 2));

    const dataId = body.data?.id;
    if (dataId === "123456" || dataId === 123456) {
      console.log("[WEBHOOK_INFO] Test notification received and acknowledged.");
      return NextResponse.json({ success: true, message: "Test notification received." });
    }
    
    const topic = body.topic || body.type;

    if (!topic || !dataId) {
      console.log("[WEBHOOK_IGNORE] Event topic/type or data ID is missing. Ignoring.", { topic, dataId });
      return NextResponse.json({ success: true, message: "Event ignored, missing type or data.id." });
    }

    let subscriptionDetails: any = null;
    let userId: string | null = null;
    let finalStatus: string | null = null;
    let preapprovalId: string | null = null;
    let nextPaymentDate: string | null = null;

    if (topic === 'preapproval' || topic === 'subscription_preapproval') {
        console.log(`[WEBHOOK_PROCESS] Handling 'preapproval' event for ID: ${dataId}`);
        subscriptionDetails = await preapprovalClient.get({ id: dataId });
        userId = subscriptionDetails?.external_reference || null;
        finalStatus = subscriptionDetails?.status || null;
        preapprovalId = subscriptionDetails?.id || null;
        nextPaymentDate = subscriptionDetails?.next_payment_date || null;
    } else if (topic === 'payment') {
        console.log(`[WEBHOOK_PROCESS] Handling 'payment' event for ID: ${dataId}`);
        const payment = await paymentClient.get({ id: dataId });
        console.log("[WEBHOOK_FETCH_SUCCESS] Full Payment Details:", JSON.stringify(payment, null, 2));
        
        if (payment.preapproval_id) {
            console.log(`[WEBHOOK_INFO] Payment is linked to preapproval: ${payment.preapproval_id}. Fetching subscription details.`);
            subscriptionDetails = await preapprovalClient.get({ id: payment.preapproval_id });
            userId = subscriptionDetails?.external_reference || null;
            finalStatus = subscriptionDetails?.status || null;
            preapprovalId = subscriptionDetails?.id || null;
            nextPaymentDate = subscriptionDetails?.next_payment_date || null;
        } else {
            console.log(`[WEBHOOK_IGNORE] Payment '${dataId}' is not associated with a subscription. No action taken.`);
        }
    } else {
        console.log(`[WEBHOOK_IGNORE] Unhandled event type: '${topic}'.`);
    }

    if (preapprovalId && userId && finalStatus) {
        console.log("[WEBHOOK_DATA] Full Subscription/Preapproval Details:", JSON.stringify(subscriptionDetails, null, 2));
        console.log(`[WEBHOOK_DATA_POINTS] Status: ${finalStatus}, Identified UserID: ${userId}, PreapprovalID: ${preapprovalId}`);

        if (finalStatus === 'authorized' || finalStatus === 'pending') {
            await updateUserSubscription(userId, preapprovalId, finalStatus, nextPaymentDate);
        } else {
            console.log(`[WEBHOOK_IGNORE] Subscription status is '${finalStatus}', which is not 'authorized' or 'pending'. No action taken for user ID: ${userId}.`);
        }
    } else {
        console.log(`[WEBHOOK_INFO] Could not process event. PreapprovalID: ${preapprovalId}, UserID: ${userId}, Status: ${finalStatus}. No action taken.`);
    }

    console.log("----- [WEBHOOK_END] Processed successfully. -----");
    return NextResponse.json({ success: true, message: "Webhook processed." });

  } catch (error: any) {
    console.error("[WEBHOOK_ERROR] Unhandled error during webhook logic processing:", error);
    const errorMessage = error.message || 'Internal Server Error';
    return NextResponse.json({ success: false, message: errorMessage }, { status: 500 });
  }
}
