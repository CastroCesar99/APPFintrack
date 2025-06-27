
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
    
    if (!adminApp) {
        console.error("[WEBHOOK_ERROR] CRITICAL: Firebase Admin SDK is not initialized. Cannot update subscription.");
        throw new Error("Server configuration error: Firebase Admin SDK not available.");
    }

    try {
        const db = getFirestore(adminApp);
        const userDocRef = db.collection('users').doc(userId);

        // Default end date is 1 month from now
        let subscriptionEndDate = new Date();
        subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);
        
        // If Mercado Pago provides a next payment date, use it as the end date
        if (nextPaymentDateStr) {
            try {
                // Adjust date format if needed, assuming YYYY/MM/DD or YYYY-MM-DD
                const parsedDate = new Date(nextPaymentDateStr.replace(/\//g, '-'));
                if (!isNaN(parsedDate.getTime())) {
                    subscriptionEndDate = parsedDate;
                    console.log(`[WEBHOOK_DATE_PARSE] Successfully parsed next_payment_date: ${nextPaymentDateStr} to ${subscriptionEndDate.toISOString()}`);
                } else {
                     console.warn(`[WEBHOOK_WARN] Could not parse next_payment_date '${nextPaymentDateStr}' into a valid date. Defaulting to 1 month from now.`);
                }
            } catch(e) {
                console.warn(`[WEBHOOK_WARN] Error parsing next_payment_date '${nextPaymentDateStr}'. Defaulting to 1 month from now. Error:`, e);
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
        throw dbError; // Propagate the error to be caught by the main handler
    }
}

export async function POST(request: NextRequest) {
  console.log("----- [WEBHOOK_START] Mercado Pago Webhook Received -----");
  
  try {
    const body = await request.json();
    console.log("[WEBHOOK_INFO] Parsed Webhook Body:", JSON.stringify(body, null, 2));

    const dataId = body.data?.id;

    // Handle test notifications specifically and exit gracefully
    if (String(dataId) === "123456") {
      console.log("[WEBHOOK_INFO] Test notification received and acknowledged. Returning 200 OK.");
      return NextResponse.json({ success: true, message: "Test notification received." }, { status: 200 });
    }
    
    const topic = body.topic || body.type;

    if (!topic || !dataId) {
      console.log("[WEBHOOK_IGNORE] Event topic/type or data ID is missing. Ignoring.", { topic, dataId });
      return NextResponse.json({ success: true, message: "Event ignored, missing type or data.id." });
    }

    if (topic === 'preapproval' || topic === 'subscription_preapproval') {
        console.log(`[WEBHOOK_PROCESS] Handling 'preapproval' event for ID: ${dataId}`);
        let subscriptionDetails;

        try {
            console.log(`[WEBHOOK_API_CALL] Fetching details for preapproval ID: ${dataId}...`);
            subscriptionDetails = await preapprovalClient.get({ id: dataId });
            console.log("[WEBHOOK_API_SUCCESS] Full Preapproval Details:", JSON.stringify(subscriptionDetails, null, 2));
        } catch (apiError: any) {
            console.error(`[WEBHOOK_API_ERROR] Failed to fetch details for preapproval ID: ${dataId}. Error:`, apiError.message);
            // It's a terminal error for this notification (e.g., ID not found), so we return 200 to prevent retries.
            return NextResponse.json({ success: true, message: `Acknowledged. Could not fetch details for ID ${dataId}.` }, { status: 200 });
        }

        const userId = subscriptionDetails?.external_reference;
        const finalStatus = subscriptionDetails?.status;
        const preapprovalId = subscriptionDetails?.id;
        const nextPaymentDate = subscriptionDetails?.next_payment_date;

        if (!userId) {
            console.log(`[WEBHOOK_IGNORE] UserID (external_reference) is missing in the subscription details for preapproval ID ${preapprovalId}. No action taken.`);
            return NextResponse.json({ success: true, message: "Event ignored, missing external_reference." });
        }

        if (finalStatus === 'authorized' || finalStatus === 'pending') {
            console.log(`[WEBHOOK_DATA_POINTS] Status: ${finalStatus}, UserID from external_reference: ${userId}, PreapprovalID: ${preapprovalId}`);
            await updateUserSubscription(userId, preapprovalId, finalStatus, nextPaymentDate);
        } else {
            console.log(`[WEBHOOK_IGNORE] Subscription status is '${finalStatus}'. No activation action taken.`);
        }
    } else {
        console.log(`[WEBHOOK_IGNORE] Unhandled event type: '${topic}'. No action taken.`);
    }

    console.log("----- [WEBHOOK_END] Processed successfully. -----");
    return NextResponse.json({ success: true, message: "Webhook processed." }, { status: 200 });

  } catch (error: any) {
    console.error("[WEBHOOK_ERROR] Unhandled error during webhook logic processing:", error);
    // Return 200 to acknowledge receipt even if our internal processing fails, to prevent Mercado Pago from resending indefinitely.
    return NextResponse.json({ success: false, message: "Internal server error occurred, but request was acknowledged." }, { status: 200 });
  }
}
