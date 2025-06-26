"use client";

import React from 'react';
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { Skeleton } from '@/components/ui/skeleton';

export default function SubscriptionPage() {
  const { user, loading: authLoading } = useAuth();
  const { translate } = useLanguage();
  
  const planId = "2c9380849783ce770197addd014510cf";
  const checkoutUrl = `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=${planId}`;

  const openCheckoutPopup = () => {
    const width = 600;
    const height = 800;
    const left = (window.innerWidth - width) / 2;
    const top = (window.innerHeight - height) / 2;
    window.open(
      checkoutUrl, 
      'mercadoPagoCheckout', 
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,resizable=yes`
    );
  };

  if (authLoading) {
    return (
      <AppLayout>
        <div className="space-y-6 max-w-2xl mx-auto">
           <Skeleton className="h-9 w-1/3 mb-4 sm:mb-0" />
           <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {translate({ en: "Subscription", pt: "Assinatura" })}
        </h1>
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>{translate({ en: 'Choose Your Plan', pt: 'Escolha seu Plano' })}</CardTitle>
            <CardDescription>{translate({ en: 'Unlock all features with our monthly subscription. Click the button below to complete your payment securely in a new window.', pt: 'Desbloqueie todos os recursos com nossa assinatura mensal. Clique no botão abaixo para concluir seu pagamento com segurança em uma nova janela.' })}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center p-8">
            <div className='text-center mb-6'>
                <p className='text-lg font-semibold text-muted-foreground'>{translate({en: "Monthly Plan", pt: "Plano Mensal"})}</p>
                <p className='text-4xl font-bold text-primary'>R$ 19,99</p>
            </div>
            <Button className="w-full" onClick={openCheckoutPopup}>
              {translate({ en: 'Subscribe via Mercado Pago', pt: 'Assinar com Mercado Pago' })}
            </Button>
            <p className="text-xs text-muted-foreground mt-4 text-center">
              {translate({ en: 'A new window will open to complete the payment. If it does not open, please disable your pop-up blocker.', pt: 'Uma nova janela será aberta para concluir o pagamento. Se não abrir, por favor, desabilite seu bloqueador de pop-ups.' })}
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
