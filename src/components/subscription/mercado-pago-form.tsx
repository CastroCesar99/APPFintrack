
"use client";

import React, { useEffect, useState } from 'react';
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/context/language-context";
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { createUserSubscription } from '@/ai/flows/create-mercadopago-subscription';
import { useRouter } from 'next/navigation';

interface MercadoPagoCardFormProps {
  publicKey: string;
  userEmail: string;
}

declare global {
  interface Window {
    MercadoPago: any;
  }
}

export function MercadoPagoCardForm({ publicKey, userEmail }: MercadoPagoCardFormProps) {
  const { toast } = useToast();
  const { translate } = useLanguage();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let cardForm: any;

    const initializeMercadoPago = async () => {
      if (window.MercadoPago) {
        const mp = new window.MercadoPago(publicKey);
        cardForm = mp.cardForm({
          amount: "39.90", // The amount from the plan
          iframe: true,
          form: {
            id: "form-checkout",
            cardNumber: { id: "form-checkout__cardNumber", placeholder: translate({ en: "Card Number", pt: "Número do Cartão" }) },
            expirationDate: { id: "form-checkout__expirationDate", placeholder: "MM/YY" },
            securityCode: { id: "form-checkout__securityCode", placeholder: translate({ en: "Security Code", pt: "Código de Segurança" }) },
            cardholderName: { id: "form-checkout__cardholderName", placeholder: translate({ en: "Cardholder Name", pt: "Nome do Titular" }) },
            issuer: { id: "form-checkout__issuer", placeholder: translate({ en: "Issuing Bank", pt: "Banco Emissor" }) },
            installments: { id: "form-checkout__installments", placeholder: translate({ en: "Installments", pt: "Parcelas" }) },
            identificationType: { id: "form-checkout__identificationType", placeholder: translate({ en: "Document Type", pt: "Tipo de Documento" }) },
            identificationNumber: { id: "form-checkout__identificationNumber", placeholder: translate({ en: "Document Number", pt: "Número do Documento" }) },
            cardholderEmail: { id: "form-checkout__cardholderEmail", placeholder: "E-mail" },
          },
          callbacks: {
            onFormMounted: (error: any) => {
              if (error) return console.warn("Form Mounted handling error: ", error);
            },
            onSubmit: async (event: Event) => {
              event.preventDefault();
              setIsLoading(true);
              setProgress(50);

              const {
                token,
                issuerId: issuer_id,
                paymentMethodId: payment_method_id,
                installments,
              } = cardForm.getCardFormData();

              try {
                const result = await createUserSubscription({
                  token,
                  issuer_id,
                  payment_method_id,
                  installments,
                  payer_email: userEmail
                });

                if (result.success) {
                  setProgress(100);
                  toast({
                    title: translate({ en: "Subscription Successful!", pt: "Assinatura Realizada com Sucesso!" }),
                    description: translate({ en: "Welcome aboard!", pt: "Bem-vindo(a) a bordo!" }),
                  });
                  router.push('/');
                } else {
                  throw new Error(result.error || translate({ en: 'An unknown error occurred.', pt: 'Ocorreu um erro desconhecido.' }));
                }
              } catch (error: any) {
                setProgress(0);
                toast({
                  title: translate({ en: "Payment Failed", pt: "Falha no Pagamento" }),
                  description: error.message,
                  variant: "destructive",
                });
                setIsLoading(false);
              }
            },
            onFetching: (resource: any) => {
              setProgress(prev => Math.max(prev, 25)); // Show some progress on fetch
              return () => {
                // Done fetching
              };
            }
          },
        });
      }
    };

    // Ensure the script is loaded before initializing
    if (document.readyState === "complete" && window.MercadoPago) {
      initializeMercadoPago();
    } else {
      window.addEventListener('load', initializeMercadoPago);
      return () => window.removeEventListener('load', initializeMercadoPago);
    }
  }, [publicKey, userEmail, translate, toast, router]);

  return (
    <>
      <style jsx>{`
        #form-checkout__cardNumber, #form-checkout__expirationDate, #form-checkout__securityCode {
          height: 40px;
          padding: 10px;
          border: 1px solid hsl(var(--border));
          border-radius: var(--radius);
          background-color: hsl(var(--background));
          margin-bottom: 1rem;
        }
        #form-checkout__cardholderName, #form-checkout__identificationNumber, #form-checkout__cardholderEmail, #form-checkout__issuer, #form-checkout__installments, #form-checkout__identificationType {
          height: 40px;
          padding: 0 10px;
          border: 1px solid hsl(var(--border));
          border-radius: var(--radius);
          background-color: hsl(var(--background));
          color: hsl(var(--foreground));
          width: 100%;
          margin-bottom: 1rem;
        }
        #form-checkout__submit {
            margin-top: 1rem;
        }
      `}</style>
      <form id="form-checkout">
        <div id="form-checkout__cardNumber" className="container"></div>
        <div className="flex gap-4">
            <div id="form-checkout__expirationDate" className="container w-1/2"></div>
            <div id="form-checkout__securityCode" className="container w-1/2"></div>
        </div>
        <input type="text" id="form-checkout__cardholderName" />
        <select id="form-checkout__issuer" className="input"></select>
        <select id="form-checkout__installments" className="input"></select>
        <div className="flex gap-4">
            <select id="form-checkout__identificationType" className="input w-1/3"></select>
            <input type="text" id="form-checkout__identificationNumber" className="w-2/3" />
        </div>
        <input type="email" id="form-checkout__cardholderEmail" defaultValue={userEmail} disabled />
        
        <Button type="submit" id="form-checkout__submit" className="w-full" disabled={isLoading}>
          {isLoading ? translate({ en: 'Processing...', pt: 'Processando...' }) : translate({ en: 'Subscribe for R$39,90/month', pt: 'Assinar por R$39,90/mês' })}
        </Button>
        {isLoading && <Progress value={progress} className="w-full mt-4" />}
      </form>
    </>
  );
}
