
import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import { adminApp } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// Initialize Mercado Pago SDK
const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN! });
const preapproval = new PreApproval(client);

// In a real production app, you would verify the webhook signature.
// For this example, we assume it's valid.

export async function POST(request: NextRequest) {
  console.log("Mercado Pago webhook received.");

  if (!adminApp) {
    console.error("CRITICAL: Firebase Admin SDK is not initialized. Cannot process webhook.");
    return NextResponse.json({ success: false, message: 'Server configuration error.' }, { status: 500 });
  }

  try {
    const body = await request.json();
    console.log("Webhook body:", JSON.stringify(body, null, 2));

    const topic = body.topic || body.type;
    const preapprovalId = body.data?.id;

    console.log(`Webhook Topic: ${topic}, ID: ${preapprovalId}`);

    if (topic === 'preapproval' && preapprovalId) {
      console.log(`Processing preapproval ID: ${preapprovalId}`);

      const subscription = await preapproval.get({ id: preapprovalId });
      console.log("Fetched subscription details. Status:", subscription.status, "External Reference:", subscription.external_reference);

      if (subscription.status === 'authorized') {
        const userId = subscription.external_reference; // This should be the Firebase UID

        if (!userId) {
          console.error(`Error: external_reference (userId) not found in subscription details for preapproval ID: ${preapprovalId}`);
          return NextResponse.json({ success: false, message: 'User ID not found in subscription.' }, { status: 400 });
        }

        const db = adminApp.firestore();
        const userDocRef = db.collection('users').doc(userId);

        const subscriptionEndDate = new Date();
        subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1); // Set subscription for 1 month

        const subscriptionData = {
          subscriptionStatus: 'active' as const,
          subscriptionId: preapprovalId,
          subscriptionEndDate: Timestamp.fromDate(subscriptionEndDate),
          updatedAt: Timestamp.now(),
        };

        // Use set with merge:true for robustness. It will create or update the document.
        await userDocRef.set(subscriptionData, { merge: true });
        
        console.log(`Successfully set subscription for user ${userId} to active.`);
      } else {
        console.log(`Subscription status is '${subscription.status}', not 'authorized'. No action taken for preapproval ID: ${preapprovalId}.`);
      }
    } else {
      console.log("Webhook received, but it was not a 'preapproval' event or ID was missing.");
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing Mercado Pago webhook:", error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}
