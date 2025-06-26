
import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import { adminApp } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

// Initialize Mercado Pago SDK
const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN! });
const preapproval = new PreApproval(client);

// This is a simplified handler. In production, you MUST verify the webhook signature.
// See: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
async function verifyWebhookSignature(request: NextRequest): Promise<boolean> {
    const signatureHeader = request.headers.get('x-signature');
    const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;

    if (!signatureHeader || !webhookSecret) {
        console.warn("Webhook signature or secret is missing. Skipping verification.");
        // In a real production app, you should return false and a 403 Forbidden status.
        // For this example, we'll allow it to proceed but log a warning.
        return true; 
    }

    // Actual signature verification logic would go here.
    // This is complex and involves creating a hash from the request body and timestamp.
    // For now, we'll assume it's valid if the header exists.
    
    return true;
}


export async function POST(request: NextRequest) {
  console.log("Mercado Pago webhook received.");

  // For production: Enable signature verification
  // const isVerified = await verifyWebhookSignature(request);
  // if (!isVerified) {
  //   return NextResponse.json({ success: false, message: 'Invalid signature' }, { status: 403 });
  // }

  try {
    const body = await request.json();
    console.log("Webhook body:", JSON.stringify(body, null, 2));

    const topic = body.topic || body.type;
    const preapprovalId = body.data?.id;

    if (topic === 'preapproval' && preapprovalId) {
      console.log(`Processing preapproval ID: ${preapprovalId}`);

      const subscription = await preapproval.get({ id: preapprovalId });
      console.log("Fetched subscription details:", JSON.stringify(subscription, null, 2));

      if (subscription.status === 'authorized') {
        const userId = subscription.external_reference;
        if (!userId) {
          console.error(`Error: external_reference (userId) not found in subscription details for preapproval ID: ${preapprovalId}`);
          return NextResponse.json({ success: false, message: 'User ID not found in subscription.' }, { status: 400 });
        }

        const db = adminApp.firestore();
        const userDocRef = db.collection('users').doc(userId);

        const subscriptionEndDate = new Date();
        subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);

        await userDocRef.update({
          subscriptionStatus: 'active',
          subscriptionId: preapprovalId,
          subscriptionEndDate: Timestamp.fromDate(subscriptionEndDate),
          updatedAt: Timestamp.now(),
        });
        
        console.log(`Successfully updated user ${userId} to active subscription.`);
      } else {
        console.log(`Subscription status is '${subscription.status}', not 'authorized'. No action taken.`);
      }
    } else {
      console.log("Webhook received, but it was not a 'preapproval' event or ID was missing.");
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing Mercado Pago webhook:", error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
