
"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/context/language-context";
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { createUserSubscription } from '@/lib/actions/mercado-pago-actions';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { cn } from '@/lib/utils';

declare global {
  interface Window {
    MercadoPago: any;
  }
}

export function MercadoPagoCardForm() {
  const { toast } = useToast();
  const { translate } = useLanguage();
  const router = useRouter();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const cardFormRef = useRef<any>(null);

  const publicKey = "TEST-2f341a85-9c17-4c58-bd7b-e2e3f9af5501"; 

  useEffect(() => {
    if (cardFormRef.current) {
      console.log("Mercado Pago Form already initialized.");
      return;
    }
    
    if (typeof window === 'undefined' || !window.MercadoPago) {
      setInitializationError(translate({ en: "Mercado Pago SDK not loaded.", pt: "SDK do Mercado Pago não carregado." }));
      return;
    }
    
    if (!publicKey || !user?.email) {
      setInitializationError(translate({ en: "User data not available.", pt: "Dados do usuário não disponíveis." }));
      return;
    }

    try {
      console.log("Attempting to initialize Mercado Pago CardForm...");
      const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
      const cardForm = mp.cardForm({
        amount: "19.99",
        iframe: true,
        form: {
          id: "form-checkout",
          cardNumber: { id: "form-checkout__cardNumber", placeholder: translate({ en: "Card Number", pt: "Número do Cartão" }) },
          expirationDate: { id: "form-checkout__expirationDate", placeholder: "MM/YY" },
          securityCode: { id: "form-checkout__securityCode", placeholder: translate({ en: "Security Code", pt: "Código de Segurança" }) },
          cardholderName: { id: "form-checkout__cardholderName", placeholder: translate({ en: "Cardholder Name", pt: "Nome do Titular" }) },
          identificationType: { id: "form-checkout__identificationType", placeholder: translate({ en: "Document Type", pt: "Tipo de Documento" }) },
          identificationNumber: { id: "form-checkout__identificationNumber", placeholder: translate({ en: "Document Number", pt: "Número do Documento" }) },
          cardholderEmail: { id: "form-checkout__cardholderEmail", placeholder: "E-mail" },
          issuer: { id: "form-checkout__issuer", placeholder: translate({ en: "Issuing Bank", pt: "Banco Emissor" }) },
          installments: { id: "form-checkout__installments", placeholder: translate({ en: "Installments", pt: "Parcelas" }) },
        },
        callbacks: {
          onFormMounted: (error: any) => {
            if (error) {
              console.error("Form Mounted handling error: ", error);
              setInitializationError(translate({en: "Could not display payment form.", pt: "Não foi possível exibir o formulário de pagamento."}));
              return;
            };
            console.log("Mercado Pago Form mounted successfully.");
          },
          onSubmit: async (event: Event) => {
            event.preventDefault();
            if (!user) {
                toast({ title: "Error", description: "User not authenticated", variant: "destructive" });
                return;
            }

            const cardFormData = cardFormRef.current?.getCardFormData();
            if (!cardFormData || !cardFormData.token) {
                 toast({ title: "Error", description: "Could not get card token. Please check your card details.", variant: "destructive"});
                 return;
            }

            setIsLoading(true);
            setProgress(50);

            try {
              const result = await createUserSubscription({
                token: cardFormData.token,
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
            console.log("Fetching resource: ", resource);
            setProgress(prev => Math.max(prev, 25));
            return () => {};
          }
        },
      });
      cardFormRef.current = cardForm;
    } catch(e: any) {
        console.error("Error initializing Mercado Pago CardForm:", e);
        const errorMessage = e.message || translate({ en: "An unknown error occurred during payment form setup.", pt: "Ocorreu um erro desconhecido durante a configuração do formulário de pagamento." });
        setInitializationError(errorMessage);
    }
  }, [user, translate, toast, router]);

  if (initializationError) {
    return <div className="text-center text-destructive p-4 font-medium">{initializationError}</div>;
  }

  const inputClasses = "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <form id="form-checkout" key={user?.uid} className="space-y-4">
      <div id="form-checkout__cardNumber" className={inputClasses}></div>
      <div className="flex gap-4">
          <div id="form-checkout__expirationDate" className={cn(inputClasses, "w-1/2")}></div>
          <div id="form-checkout__securityCode" className={cn(inputClasses, "w-1/2")}></div>
      </div>
      <input type="text" id="form-checkout__cardholderName" className={inputClasses} />
      <select id="form-checkout__issuer" className={inputClasses}></select>
      <div className="flex gap-4">
          <select id="form-checkout__identificationType" className={cn(inputClasses, "w-1/3")}></select>
          <input type="text" id="form-checkout__identificationNumber" className={cn(inputClasses, "w-2/3")} />
      </div>
      <select id="form-checkout__installments" className={inputClasses}></select>
      <input type="hidden" id="form-checkout__cardholderEmail" defaultValue={user?.email || ""} />
      
      <Button type="submit" id="form-checkout__submit" className="w-full mt-4" disabled={isLoading || !user}>
        {isLoading ? translate({ en: 'Processing...', pt: 'Processando...' }) : translate({ en: 'Subscribe for R$19.99/month', pt: 'Assinar por R$19,99/mês' })}
      </Button>
      {isLoading && <Progress value={progress} className="w-full mt-4" />}
    </form>
  );
}
