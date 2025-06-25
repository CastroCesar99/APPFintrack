
'use server';
/**
 * @fileOverview A Genkit flow to create a Mercado Pago subscription plan.
 *
 * - createSubscriptionPlan - A function that handles the subscription plan creation.
 * - CreateSubscriptionOutput - The return type for the createSubscriptionPlan function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const CreateSubscriptionInputSchema = z.object({
  // Placeholder for future inputs, e.g., userId or planId
});
export type CreateSubscriptionInput = z.infer<typeof CreateSubscriptionInputSchema>;

const CreateSubscriptionOutputSchema = z.object({
  init_point: z.string().describe("The checkout URL to which the user should be redirected."),
});
export type CreateSubscriptionOutput = z.infer<typeof CreateSubscriptionOutputSchema>;

export async function createSubscriptionPlan(input: CreateSubscriptionInput): Promise<CreateSubscriptionOutput> {
  return createSubscriptionPlanFlow(input);
}

const createSubscriptionPlanFlow = ai.defineFlow(
  {
    name: 'createSubscriptionPlanFlow',
    inputSchema: CreateSubscriptionInputSchema,
    outputSchema: CreateSubscriptionOutputSchema,
  },
  async (input) => {
    const accessToken = process.env.NEXT_PUBLIC_MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) {
        console.error("Mercado Pago access token is not configured.");
        throw new Error("Server configuration error: Missing payment provider token.");
    }
    
    const planPayload = {
      reason: "Assinatura Mensal FinTrack",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        repetitions: 12,
        billing_day: 10,
        billing_day_proportional: false,
        free_trial: {
          frequency: 7,
          frequency_type: "days"
        },
        transaction_amount: 39.90,
        currency_id: "BRL"
      },
      payment_methods_allowed: {
        payment_types: [
          { "id": "credit_card" },
          { "id": "debit_card" },
          { "id": "pix" }
        ],
        payment_methods: []
      },
      back_url": "https://fintrack-beta.vercel.app/"
    };

    console.log("Sending payload to Mercado Pago:", JSON.stringify(planPayload, null, 2));

    try {
      const response = await fetch('https://api.mercadopago.com/preapproval_plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(planPayload)
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error("Mercado Pago API Error:", responseData);
        throw new Error(`Failed to create subscription plan. Status: ${response.status}. Message: ${responseData.message || 'Unknown error'}`);
      }

      console.log("Mercado Pago API Success Response:", responseData);

      if (!responseData.init_point) {
        throw new Error("Mercado Pago response did not include an init_point URL.");
      }

      return { init_point: responseData.init_point };

    } catch (error) {
      console.error("Error in createSubscriptionPlanFlow:", error);
      // Re-throw a generic error to not expose internal details to the client
      throw new Error("Could not create subscription plan at this time.");
    }
  }
);
