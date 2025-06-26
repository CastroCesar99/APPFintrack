
"use client";

import React from 'react';
import Link from 'next/link';
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { Skeleton } from '@/components/ui/skeleton';

export default function SubscriptionPage() {
  const { user, loading: authLoading } = useAuth();
  const { translate } = useLanguage();
  
  const planId = "2c938084979341770197acaba53a0a05";
  const checkoutUrl = `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=${planId}`;

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
            <CardDescription>{translate({ en: 'Unlock all features with our monthly subscription. You will be redirected to Mercado Pago to complete your payment securely.', pt: 'Desbloqueie todos os recursos com nossa assinatura mensal. Você será redirecionado para o Mercado Pago para concluir seu pagamento com segurança.' })}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center p-8">
            <div className='text-center mb-6'>
                <p className='text-lg font-semibold text-muted-foreground'>{translate({en: "Monthly Plan", pt: "Plano Mensal"})}</p>
                <p className='text-4xl font-bold text-primary'>R$ 19,99</p>
            </div>
            <Link href={checkoutUrl} passHref legacyBehavior>
              <a target="_blank" rel="noopener noreferrer" className="w-full">
                <Button className="w-full">
                  {translate({ en: 'Subscribe via Mercado Pago', pt: 'Assinar com Mercado Pago' })}
                </Button>
              </a>
            </Link>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
