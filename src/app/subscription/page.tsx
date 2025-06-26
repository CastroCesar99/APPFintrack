
"use client";

import React from 'react';
import Script from 'next/script';
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { MercadoPagoCardForm } from '@/components/subscription/mercado-pago-form';
import { Skeleton } from '@/components/ui/skeleton';

export default function SubscriptionPage() {
  const { user, loading: authLoading } = useAuth();
  const { translate } = useLanguage();
  
  if (authLoading) {
    return (
      <AppLayout>
        <div className="space-y-6 max-w-2xl mx-auto">
           <Skeleton className="h-9 w-1/3 mb-4 sm:mb-0" />
           <Skeleton className="h-96 w-full" />
        </div>
      </AppLayout>
    )
  }

  return (
    <>
      <Script src="https://sdk.mercadopago.com/js/v2" strategy="beforeInteractive" />
      <AppLayout>
        <div className="space-y-6 max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {translate({ en: "Subscription", pt: "Assinatura" })}
          </h1>
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>{translate({ en: 'Choose Your Plan', pt: 'Escolha seu Plano' })}</CardTitle>
              <CardDescription>{translate({ en: 'Unlock all features with our monthly subscription.', pt: 'Desbloqueie todos os recursos com nossa assinatura mensal.' })}</CardDescription>
            </CardHeader>
            <CardContent>
              {user?.email ? (
                  <MercadoPagoCardForm />
              ) : (
                <div className="text-center text-muted-foreground p-8">
                  <p>{translate({ en: 'Please log in to subscribe.', pt: 'Por favor, faça login para assinar.' })}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    </>
  );
}
