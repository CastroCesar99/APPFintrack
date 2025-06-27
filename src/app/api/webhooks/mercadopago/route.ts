
import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import { adminApp } from '@/lib/firebase-admin';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
if (!accessToken) {
    console.error("CRITICAL: MERCADOPAGO_ACCESS_TOKEN is not defined.");
}
const client = new MercadoPagoConfig({ accessToken: accessToken! });
const preapprovalClient = new PreApproval(client);

async function updateUserSubscription(userId: string, preapprovalId: string, status: string, nextPaymentDateStr?: string | null) {
    console.log(`[WEBHOOK_ACTION_START] Attempting subscription update for user: ${userId}`);
    
    // CRITICAL CHECK: Verify that Firebase Admin SDK is initialized.
    if (!adminApp) {
        console.error("[WEBHOOK_ERROR] CRITICAL: Firebase Admin SDK is not initialized. This is likely due to a missing or invalid FIREBASE_SERVICE_ACCOUNT_KEY environment variable. Cannot update subscription.");
        throw new Error("Server configuration error: Firebase Admin SDK not available.");
    }

    try {
        const db = getFirestore(adminApp);
        const userDocRef = db.collection('users').doc(userId);

        let subscriptionEndDate = new Date();
        subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);
        
        if (nextPaymentDateStr) {
            try {
                const parsedDate = new Date(nextPaymentDateStr.replace(/\//g, '-'));
                if (!isNaN(parsedDate.getTime())) {
                    subscriptionEndDate = parsedDate;
                }
            } catch(e) {
                console.warn(`[WEBHOOK_WARN] Could not parse next_payment_date '${nextPaymentDateStr}'. Defaulting to 1 month from now.`);
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

        console.log(`[WEBHOOK_FIRESTORE] Attempting to write to Firestore for user: ${userId} with data:`, JSON.stringify(subscriptionData, null, 2));
        await userDocRef.set({ ...subscriptionData }, { merge: true });
        console.log(`[WEBHOOK_SUCCESS] Firestore updated successfully for user ${userId}. Subscription is now active.`);
    } catch (dbError) {
        console.error(`[WEBHOOK_FIRESTORE_ERROR] Failed to write to Firestore for user ${userId}. Error:`, dbError);
        throw dbError;
    }
}

export async function POST(request: NextRequest) {
  console.log("----- [WEBHOOK_START] Mercado Pago Webhook Received -----");
  
  try {
    const body = await request.json();
    console.log("[WEBHOOK_INFO] Parsed Webhook Body:", JSON.stringify(body, null, 2));

    const dataId = body.data?.id;
    if (dataId === "123456" || dataId === 123456) {
      console.log("[WEBHOOK_INFO] Test notification received and acknowledged. Returning 200 OK.");
      return NextResponse.json({ success: true, message: "Test notification received." }, { status: 200 });
    }
    
    const topic = body.topic || body.type;

    if (!topic || !dataId) {
      console.log("[WEBHOOK_IGNORE] Event topic/type or data ID is missing. Ignoring.", { topic, dataId });
      return NextResponse.json({ success: true, message: "Event ignored, missing type or data.id." });
    }

    // Handle both preapproval and payment notifications to be safe
    if (topic === 'preapproval' || topic === 'subscription_preapproval') {
        console.log(`[WEBHOOK_PROCESS] Handling 'preapproval' event for ID: ${dataId}`);
        const subscriptionDetails = await preapprovalClient.get({ id: dataId });
        console.log("[WEBHOOK_FETCH_SUCCESS] Full Preapproval Details:", JSON.stringify(subscriptionDetails, null, 2));

        const userId = subscriptionDetails?.external_reference;
        const finalStatus = subscriptionDetails?.status;
        const preapprovalId = subscriptionDetails?.id;
        const nextPaymentDate = subscriptionDetails?.next_payment_date;

        if (userId && preapprovalId && (finalStatus === 'authorized' || finalStatus === 'pending')) {
            console.log(`[WEBHOOK_DATA_POINTS] Status: ${finalStatus}, UserID from external_reference: ${userId}, PreapprovalID: ${preapprovalId}`);
            await updateUserSubscription(userId, preapprovalId, finalStatus, nextPaymentDate);
        } else {
            console.log(`[WEBHOOK_IGNORE] Subscription status is '${finalStatus}' or UserID is missing. No action taken.`);
        }
    } else {
        console.log(`[WEBHOOK_IGNORE] Unhandled event type: '${topic}'. No action taken.`);
    }

    console.log("----- [WEBHOOK_END] Processed successfully. -----");
    return NextResponse.json({ success: true, message: "Webhook processed." }, { status: 200 });

  } catch (error: any) {
    console.error("[WEBHOOK_ERROR] Unhandled error during webhook logic processing:", error);
    const errorMessage = error.message || 'Internal Server Error';
    // Log the error but return a 200 to Mercado Pago to prevent retries for unrecoverable errors.
    // You might change this to 500 for specific, retryable errors.
    return NextResponse.json({ success: false, message: "Error processed but acknowledged." }, { status: 200 });
  }
}
