
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
  console.log("----- Mercado Pago Webhook Received -----");

  if (!adminApp) {
    console.error("CRITICAL: Firebase Admin SDK is not initialized. Cannot process webhook.");
    return NextResponse.json({ success: false, message: 'Server configuration error.' }, { status: 500 });
  }

  try {
    const body = await request.json();
    console.log("Webhook Body:", JSON.stringify(body, null, 2));

    const topic = body.topic || body.type;
    const preapprovalId = body.data?.id;

    console.log(`Webhook Topic: '${topic}', Preapproval ID: '${preapprovalId}'`);

    if (topic !== 'preapproval' || !preapprovalId) {
        console.log("Webhook is not a relevant preapproval event. Ignoring.");
        return NextResponse.json({ success: true, message: "Event ignored." });
    }

    console.log(`Fetching details for preapproval ID: ${preapprovalId}...`);
    const subscription = await preapproval.get({ id: preapprovalId });
    
    console.log("Full Subscription Details from MP:", JSON.stringify(subscription, null, 2));
    console.log("Subscription Status:", subscription.status);
    console.log("External Reference received:", subscription.external_reference);

    if (subscription.status === 'authorized') {
        let userId = subscription.external_reference;

        if (!userId) {
            console.error(`Error: external_reference is missing for preapproval ID: ${preapprovalId}`);
            return NextResponse.json({ success: false, message: 'External reference (user ID) not found in subscription.' }, { status: 400 });
        }
        
        // This makes the code robust to different formats of external_reference
        if (userId.startsWith('fintrack-user-')) {
            const parts = userId.split('-');
            if (parts.length >= 3) {
                userId = parts[2];
                console.log(`Extracted clean userId '${userId}' from complex external_reference.`);
            } else {
                 console.error(`Error: Could not parse complex external_reference: ${subscription.external_reference}`);
                 return NextResponse.json({ success: false, message: 'Invalid external reference format.' }, { status: 400 });
            }
        } else {
            console.log(`Using direct external_reference as userId: '${userId}'`);
        }

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

        console.log(`Attempting to update Firestore for user: ${userId} with data:`, JSON.stringify(subscriptionData, null, 2));

        // Use set with merge:true for robustness. It will create or update the document.
        await userDocRef.set(subscriptionData, { merge: true });
        
        console.log(`SUCCESS: Firestore updated for user ${userId}. Subscription set to active.`);

    } else {
        console.log(`Subscription status is '${subscription.status}', not 'authorized'. No Firestore action taken for preapproval ID: ${preapprovalId}.`);
    }
    
    return NextResponse.json({ success: true, message: "Webhook processed." });

  } catch (error) {
    console.error("Error processing Mercado Pago webhook:", error);
    // @ts-ignore
    const errorMessage = error.message || 'Internal Server Error';
    return NextResponse.json({ success: false, message: errorMessage }, { status: 500 });
  }
}
