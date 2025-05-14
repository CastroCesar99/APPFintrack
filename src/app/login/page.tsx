
"use client"; // This page must be a client component

import type React from 'react';
import Link from 'next/link';
import { AuthFormWrapper } from '@/components/auth/auth-form-wrapper';
import { LoginForm } from '@/components/auth/login-form';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useLanguage } from '@/context/language-context';

export default function LoginPage() {
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
        <p className="text-foreground">{translate({ en: "Loading...", pt: "Carregando..."})}</p>
      </div>
    );
  }

  const pageTitle = translate({ en: "Welcome Back!", pt: "Bem-vindo(a) de Volta!" });
  const pageDescription = translate({ en: "Log in to access your FinTrack dashboard.", pt: "Faça login para acessar seu painel FinTrack." });
  const footerSignUpText = translate({ en: "Sign up", pt: "Cadastre-se" });
  const footerPromptText = translate({ en: "Don't have an account?", pt: "Não tem uma conta?" });


  return (
    <AuthFormWrapper
      title={pageTitle}
      description={pageDescription}
      footerContent={
        <p>
          {footerPromptText}{' '}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            {footerSignUpText}
          </Link>
        </p>
      }
    >
      <LoginForm />
    </AuthFormWrapper>
  );
}
