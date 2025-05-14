
"use client";

import type React from 'react';
import { OnboardingForm } from '@/components/onboarding/onboarding-form';
import { AppLogoIcon } from '@/components/icons';

export default function OnboardingPage() {
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
