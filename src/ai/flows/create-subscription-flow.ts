
'use server';
/**
 * @fileOverview A Genkit flow for creating a Mercado Pago subscription.
 * This flow wraps the createUserSubscription server action.
 */

import { ai } from '@/ai/genkit';
import {
  createUserSubscription,
  CreateUserSubscriptionInputSchema,
  CreateUserSubscriptionOutputSchema,
  type CreateUserSubscriptionInput,
  type CreateUserSubscriptionOutput,
} from './create-mercadopago-subscription';

const createSubscriptionFlow = ai.defineFlow(
  {
    name: 'createSubscriptionFlow',
    inputSchema: CreateUserSubscriptionInputSchema,
    outputSchema: CreateUserSubscriptionOutputSchema,
  },
  async (input) => {
    // This flow acts as a wrapper around the existing server action.
    // This allows it to be potentially chained with other AI-related steps in the future.
    return await createUserSubscription(input);
  }
);

/**
 * An exported function that can be called from client components to invoke the flow.
 */
export async function createSubscription(input: CreateUserSubscriptionInput): Promise<CreateUserSubscriptionOutput> {
  return createSubscriptionFlow(input);
}
