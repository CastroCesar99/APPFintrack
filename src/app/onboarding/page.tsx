
"use client";

import type React from 'react';
import { OnboardingForm } from '@/components/onboarding/onboarding-form';
import { AppLogoIcon } from '@/components/icons';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react'; // Import useState
import { useLanguage } from '@/context/language-context';
import { doc, getDoc } from "firebase/firestore"; // Import Firestore functions
import { db } from "@/lib/firebase"; // Import db

export default function OnboardingPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { translate } = useLanguage();
  const [onboardingChecked, setOnboardingChecked] = useState(false); // New state

  useEffect(() => {
    if (authLoading) {
      return; // Wait for auth state to resolve
    }
    if (!user) {
      router.push('/login'); // If no user, redirect to login
      return;
    }

    // Check Firestore for onboarding status
    const checkOnboardingStatus = async () => {
      const userDocRef = doc(db, "users", user.uid);
      try {
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists() && userDocSnap.data().onboardingComplete) {
          localStorage.setItem('onboardingComplete', 'true'); // Sync localStorage for safety
          router.push('/');
        } else {
          localStorage.removeItem('onboardingComplete'); // Ensure localStorage is clear
          setOnboardingChecked(true); // Mark as checked, allow form to render
        }
      } catch (error) {
        console.error("Error checking onboarding status:", error);
        // Fallback: allow rendering the form if Firestore check fails,
        // it will re-check on form submit or next load.
        setOnboardingChecked(true);
      }
    };

    checkOnboardingStatus();

  }, [user, authLoading, router]);


  if (authLoading || !onboardingChecked) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-foreground">{translate({ en: "Loading...", pt: "Carregando..."})}</p>
      </div>
    );
  }
  // If user is loaded, onboarding is not complete in Firestore, and checks are done, render the form
  return (
    <div className="w-full min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="flex flex-col items-center mb-8">
          <AppLogoIcon className="h-12 w-12 text-primary mb-3" />
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
