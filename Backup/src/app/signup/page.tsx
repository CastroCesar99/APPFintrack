
"use client"; // This page must be a client component

import type React from 'react';
import Link from 'next/link';
import { AuthFormWrapper } from '@/components/auth/auth-form-wrapper';
import { SignupForm } from '@/components/auth/signup-form';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useLanguage } from '@/context/language-context';

export default function SignupPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { translate } = useLanguage();

  useEffect(() => {
    if (!loading && user) {
      router.push('/'); // Redirect to dashboard if already logged in
    }
  }, [user, loading, router]);

  if (loading || (!loading && user)) {
     // Show loading or blank screen while checking auth status or redirecting
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-foreground">{translate({ en: "Loading...", pt: "Carregando..." })}</p>
      </div>
    );
  }

  const pageTitle = translate({ en: "Create Your Athena Account", pt: "Crie Sua Conta Athena" });
  const pageDescription = translate({ en: "Start organizing your finances today.", pt: "Comece a organizar suas finanças hoje mesmo." });
  const footerLoginText = translate({ en: "Log In", pt: "Faça Login" });
  const footerPromptText = translate({ en: "Already have an account?", pt: "Já tem uma conta?" });

  return (
    <AuthFormWrapper
      title={pageTitle}
      description={pageDescription}
      footerContent={
        <p>
          {footerPromptText}{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            {footerLoginText}
          </Link>
        </p>
      }
    >
      <SignupForm />
    </AuthFormWrapper>
  );
}
