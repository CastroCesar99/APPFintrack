
"use client";

import type React from 'react';
import { OnboardingForm } from '@/components/onboarding/onboarding-form';
// AppLogoIcon import removed
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/context/language-context';
import { useToast } from "@/hooks/use-toast";

export default function OnboardingPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { translate } = useLanguage();
  const { toast } = useToast();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
  }, [user, authLoading, router]);


  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen w-full bg-background">
        <p className="text-foreground">{translate({ en: "Loading...", pt: "Carregando..."})}</p>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="flex flex-col items-center mb-8">
          {/* AppLogoIcon removed from here */}
          <h1 className="text-3xl font-bold text-center mb-2">
            {translate({ en: "Welcome to FinTrack!", pt: "Bem-vindo(a) ao FinTrack!" })}
          </h1>
          <p className="text-muted-foreground text-center">
            {translate({
              en: "Let's start your financial journey. Tell us a bit about yourself.",
              pt: "Vamos começar sua jornada financeira. Conte-nos um pouco sobre você."
            })}
          </p>
        </div>
        <OnboardingForm />
      </div>
    </div>
  );
}
