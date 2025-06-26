"use client";

import React, { useEffect, useState } from 'react';
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/context/language-context";
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { createUserSubscription } from '@/ai/flows/create-mercadopago-subscription';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';

interface MercadoPagoCardFormProps {
  // Props are no longer needed as they are derived from context or hardcoded
}

declare global {
  interface Window {
    MercadoPago: any;
  }
}

export function MercadoPagoCardForm({}: MercadoPagoCardFormProps) {
  const { toast } = useToast();
  const { translate } = useLanguage();
  const router = useRouter();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Test Public Key provided by the user.
  const publicKey = "TEST-2f341a85-9c17-4c58-bd7b-e2e3f9af5501"; 

  useEffect(() => {
    let cardForm: any;

    const initializeMercadoPago = async () => {
      if (!window.MercadoPago || !publicKey || !user?.email) {
          console.warn("Mercado Pago SDK not loaded or missing required data (PublicKey/UserEmail).");
          return;
      }

      const mp = new window.MercadoPago(publicKey);
      cardForm = mp.cardForm({
        amount: "19.99",
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
            if (!user) {
                toast({ title: "Error", description: "User not authenticated", variant: "destructive" });
                return;
            }
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
                payer_email: user.email!,
                userId: user.uid,
              });

              if (result.success && result.init_point) {
                window.location.href = result.init_point;
              } else if (result.success) {
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
            setProgress(prev => Math.max(prev, 25));
            return () => {};
          }
        },
      });
    };

    if (document.readyState === "complete" && window.MercadoPago) {
      initializeMercadoPago();
    } else {
      window.addEventListener('load', initializeMercadoPago);
      return () => window.removeEventListener('load', initializeMercadoPago);
    }
  }, [publicKey, user, translate, toast, router]);

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
        <input type="email" id="form-checkout__cardholderEmail" defaultValue={user?.email || ""} disabled />
        
        <Button type="submit" id="form-checkout__submit" className="w-full" disabled={isLoading || !user}>
          {isLoading ? translate({ en: 'Processing...', pt: 'Processando...' }) : translate({ en: 'Subscribe for R$19.99/month', pt: 'Assinar por R$19,99/mês' })}
        </Button>
        {isLoading && <Progress value={progress} className="w-full mt-4" />}
      </form>
    </>
  );
}
