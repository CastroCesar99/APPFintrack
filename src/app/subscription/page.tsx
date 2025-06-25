
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, Timestamp, serverTimestamp } from "firebase/firestore";
import { format } from "date-fns";
import { ptBR, enUS } from 'date-fns/locale';
import Link from 'next/link';

type SubscriptionStatus = 'trial' | 'active' | 'inactive' | 'canceled' | 'expired';

interface UserSubscriptionData {
  status: SubscriptionStatus;
  trialEndDate?: Date;
  subscriptionEndDate?: Date;
}

export default function SubscriptionPage() {
  const { user, loading: authLoading } = useAuth();
  const { translate, language } = useLanguage();
  const { toast } = useToast();
  
  const [subscriptionData, setSubscriptionData] = useState<UserSubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);

  const fetchSubscriptionStatus = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(userDocRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        let status: SubscriptionStatus = data.subscriptionStatus || 'inactive';
        const trialEndDate = data.trialEndDate?.toDate();
        const subscriptionEndDate = data.subscriptionEndDate?.toDate();
        const now = new Date();

        if (status === 'trial' && trialEndDate && trialEndDate < now) {
          status = 'expired';
        }
        if (status === 'active' && subscriptionEndDate && subscriptionEndDate < now) {
          status = 'expired';
        }
        
        setSubscriptionData({
          status: status,
          trialEndDate: trialEndDate,
          subscriptionEndDate: subscriptionEndDate,
        });

      } else {
        setSubscriptionData({ status: 'inactive' });
      }
    } catch (error) {
      console.error("Error fetching subscription status:", error);
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: translate({ en: "Could not load your subscription status.", pt: "Não foi possível carregar seu status de assinatura." }),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, toast, translate]);

  useEffect(() => {
    if (!authLoading) {
      fetchSubscriptionStatus();
    }
  }, [authLoading, fetchSubscriptionStatus]);

  const handleSimulatePayment = async () => {
    if (!user) return;
    setIsSimulating(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const newSubscriptionEndDate = new Date();
      newSubscriptionEndDate.setDate(newSubscriptionEndDate.getDate() + 30);

      await updateDoc(userDocRef, {
        subscriptionStatus: 'active',
        subscriptionEndDate: Timestamp.fromDate(newSubscriptionEndDate),
        updatedAt: serverTimestamp(),
      });

      toast({
        title: translate({ en: "Payment Simulated", pt: "Pagamento Simulado" }),
        description: translate({ en: "Your subscription is now active for 30 days.", pt: "Sua assinatura agora está ativa por 30 dias." }),
      });
      await fetchSubscriptionStatus(); // Refresh data
    } catch (error) {
       console.error("Error simulating payment:", error);
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: translate({ en: "Could not simulate the payment.", pt: "Não foi possível simular o pagamento." }),
        variant: "destructive",
      });
    } finally {
      setIsSimulating(false);
    }
  }

  const renderStatusContent = () => {
    if (isLoading || !subscriptionData) {
      return <Skeleton className="h-48 w-full" />;
    }

    const locale = language === 'pt' ? ptBR : enUS;
    const { status, trialEndDate, subscriptionEndDate } = subscriptionData;

    switch (status) {
      case 'trial':
        return (
          <>
            <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                {translate({ en: 'Trial Period', pt: 'Período de Teste' })}
            </Badge>
            <CardTitle className="mt-4">{translate({ en: 'You are on a Free Trial!', pt: 'Você está em um Teste Gratuito!' })}</CardTitle>
            <CardDescription>
              {trialEndDate 
                ? `${translate({ en: 'Your free trial ends on', pt: 'Seu teste gratuito termina em' })} ${format(trialEndDate, 'PPP', { locale })}.`
                : translate({ en: 'Enjoy full access to all features.', pt: 'Aproveite o acesso completo a todos os recursos.' })
              }
            </CardDescription>
            <Link href="https://www.mercadopago.com.br/" target="_blank" rel="noopener noreferrer" className="w-full">
              <Button className="w-full mt-6 bg-primary hover:bg-primary/90">
                <Star className="mr-2 h-4 w-4" />
                {translate({ en: 'Subscribe Now', pt: 'Assine Agora' })}
              </Button>
            </Link>
          </>
        );
      case 'active':
        return (
          <>
            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                <CheckCircle2 className="mr-1 h-4 w-4" />
                {translate({ en: 'Active Subscriber', pt: 'Assinatura Ativa' })}
            </Badge>
            <CardTitle className="mt-4">{translate({ en: 'Your Subscription is Active', pt: 'Sua Assinatura está Ativa' })}</CardTitle>
            <CardDescription>
              {subscriptionEndDate
                ? `${translate({ en: 'Thank you for being a subscriber! Your access is valid until', pt: 'Obrigado por ser um assinante! Seu acesso é válido até' })} ${format(subscriptionEndDate, 'PPP', { locale })}.`
                : translate({ en: 'Thank you for being a subscriber!', pt: 'Obrigado por ser um assinante!' })
              }
            </CardDescription>
             <Link href="https://www.mercadopago.com.br/subscriptions" target="_blank" rel="noopener noreferrer" className="w-full">
              <Button className="w-full mt-6 bg-primary hover:bg-primary/90">
                {translate({ en: 'Manage Subscription', pt: 'Gerenciar Assinatura' })}
              </Button>
            </Link>
          </>
        );
      case 'expired':
      case 'inactive':
      case 'canceled':
        return (
          <>
            <Badge variant="destructive">
                <XCircle className="mr-1 h-4 w-4" />
                {translate({ en: 'Subscription Required', pt: 'Assinatura Necessária' })}
            </Badge>
            <CardTitle className="mt-4">{translate({ en: 'Your Access Has Expired', pt: 'Seu Acesso Expirou' })}</CardTitle>
            <CardDescription>
              {translate({ en: 'Please subscribe to continue using FinTrack and keep your finances in order.', pt: 'Por favor, assine para continuar usando o FinTrack e manter suas finanças em ordem.' })}
            </CardDescription>
            <Link href="https://www.mercadopago.com.br/" target="_blank" rel="noopener noreferrer" className="w-full">
              <Button className="w-full mt-6 bg-primary hover:bg-primary/90">
                 <Star className="mr-2 h-4 w-4" />
                {translate({ en: 'Subscribe Now', pt: 'Assine Agora' })}
              </Button>
            </Link>
          </>
        );
      default:
        return null;
    }
  };


  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {translate({ en: "Subscription", pt: "Assinatura" })}
        </h1>
        <Card className="shadow-lg text-center">
          <CardHeader>
            <div className="flex flex-col items-center gap-2">
              {renderStatusContent()}
            </div>
          </CardHeader>
          <CardContent>
            <div className="mt-4 border-t pt-4">
                <p className="text-sm text-muted-foreground">{translate({ en: 'For testing purposes:', pt: 'Para fins de teste:' })}</p>
                <Button onClick={handleSimulatePayment} variant="secondary" className="mt-2" disabled={isSimulating}>
                    {isSimulating ? translate({ en: 'Processing...', pt: 'Processando...' }) : translate({ en: 'Simulate 30-Day Subscription', pt: 'Simular Assinatura de 30 Dias' })}
                </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
