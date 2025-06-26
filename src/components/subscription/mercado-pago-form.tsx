
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
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);

  // Chave pública de teste do Mercado Pago
  const publicKey = "TEST-2f341a85-9c17-4c58-bd7b-e2e3f9af5501"; 

  // Effect to track script loading
  useEffect(() => {
    if (document.querySelector('script[src="https://sdk.mercadopago.com/js/v2"]')) {
      if (window.MercadoPago) setIsScriptLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.onload = () => {
      console.log("Mercado Pago SDK script loaded successfully.");
      setIsScriptLoaded(true);
    };
    script.onerror = (e) => {
      console.error("Error loading Mercado Pago SDK script:", e);
      setInitializationError(translate({ en: "Could not load payment script. Please check your connection.", pt: "Não foi possível carregar o script de pagamento. Verifique sua conexão."}));
    };
    document.body.appendChild(script);

    return () => {
      const existingScript = document.querySelector('script[src="https://sdk.mercadopago.com/js/v2"]');
      if (existingScript) document.body.removeChild(existingScript);
    }
  }, [translate]);


  useEffect(() => {
    if (!isScriptLoaded || !window.MercadoPago || cardFormRef.current) {
        return;
    }
    
    if (!publicKey || !user?.email) {
      const errorMsg = translate({ en: "User data or public key not available. Cannot initialize payment form.", pt: "Dados do usuário ou chave pública não disponíveis. Não é possível inicializar o formulário de pagamento." });
      setInitializationError(errorMsg);
      return;
    }

    let cardFormInstance: any;

    try {
      console.log("Attempting to initialize Mercado Pago CardForm with locale 'pt-BR'...");
      const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });

      cardFormInstance = mp.cardForm({
        iframe: true,
        form: {
          id: "form-checkout",
          cardNumber: { id: "form-checkout__cardNumber", placeholder: translate({ en: "Card Number", pt: "Número do Cartão" }) },
          expirationDate: { id: "form-checkout__expirationDate", placeholder: "MM/AA" },
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
            setIsLoading(true);
            setProgress(50);
            
            try {
              const cardFormData = cardFormRef.current?.getCardFormData();
              
              if (!cardFormData || !cardFormData.token) {
                 toast({ title: "Error", description: "Could not get card token. Please check your card details.", variant: "destructive"});
                 setIsLoading(false);
                 setProgress(0);
                 return;
              }

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
      cardFormRef.current = cardFormInstance;
    } catch(e: any) {
        console.error("Error initializing Mercado Pago CardForm:", e);
        const errorMessage = e.message || translate({ en: "An unknown error occurred during payment form setup.", pt: "Ocorreu um erro desconhecido durante a configuração do formulário de pagamento." });
        setInitializationError(errorMessage);
    }
    
    return () => {
        if (cardFormInstance && typeof cardFormInstance.unmount === 'function') {
            console.log("Unmounting Mercado Pago Card Form");
            cardFormInstance.unmount();
        }
        cardFormRef.current = null;
    }

  }, [user, translate, toast, router, isScriptLoaded]);

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
      <input type="email" id="form-checkout__cardholderEmail" className={inputClasses} defaultValue={user?.email || ""} />
      <select id="form-checkout__issuer" className={inputClasses}></select>
      <div className="flex gap-4">
          <select id="form-checkout__identificationType" className={cn(inputClasses, "w-1/3")}></select>
          <input type="text" id="form-checkout__identificationNumber" className={cn(inputClasses, "w-2/3")} />
      </div>
      <select id="form-checkout__installments" className={inputClasses}></select>
      
      <Button type="submit" id="form-checkout__submit" className="w-full mt-4" disabled={isLoading || !user}>
        {isLoading ? translate({ en: 'Processing...', pt: 'Processando...' }) : translate({ en: 'Subscribe for R$19.99/month', pt: 'Assinar por R$19,99/mês' })}
      </Button>
      {isLoading && <Progress value={progress} className="w-full mt-4" />}
    </form>
  );
}
