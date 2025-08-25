
'use server';
/**
 * @fileOverview A Genkit flow for creating a Mercado Pago subscription.
 * This flow wraps the createUserSubscription server action.
 */

// This file is no longer used as Mercado Pago subscription creation
// has been removed.

/**
 * This function is no longer used as Mercado Pago subscription creation
 * has been removed.
 *
 * @deprecated
 */
export async function createSubscription(...args: any[]): Promise<any> {
  console.warn("createSubscription function called, but Mercado Pago subscription is removed. This function is deprecated.");
  return { success: false, message: "Mercado Pago subscription functionality has been removed." };
}
