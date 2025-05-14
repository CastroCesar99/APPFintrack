
"use client";

import type React from 'react';
import { OnboardingForm } from '@/components/onboarding/onboarding-form';
import { AppLogoIcon } from '@/components/icons';
import { useAuth } from '@/context/auth-context'; // Import useAuth
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function OnboardingPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) {
      return; // Wait for auth to resolve
    }
    if (!user) {
      router.push('/login'); // Redirect to login if not authenticated
    }
    // If user is authenticated, and onboarding is already complete, redirect to dashboard
    // This prevents re-doing onboarding if user navigates here manually after completion.
    else if (localStorage.getItem('onboardingComplete') === 'true') {
        router.push('/');
    }

  }, [user, authLoading, router]);

  if (authLoading || (!user && !authLoading) || (user && localStorage.getItem('onboardingComplete') === 'true')) {
    // Show loading screen while auth status is checked or if redirecting
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-foreground">Carregando...</p>
      </div>
    );
  }

  // Only render onboarding form if user is authenticated and onboarding is not complete
  return (
    <div className="w-full min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="flex flex-col items-center mb-8">
          <AppLogoIcon className="h-12 w-12 text-primary mb-3" />
          <h1 className="text-3xl font-bold text-center mb-2">Bem-vindo(a) ao FinTrack!</h1>
          <p className="text-muted-foreground text-center">
            Vamos começar sua jornada financeira. Conte-nos um pouco sobre você.
          </p>
        </div>
        <OnboardingForm />
      </div>
    </div>
  );
}
