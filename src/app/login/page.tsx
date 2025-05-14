
"use client"; // This page must be a client component

import type React from 'react';
import Link from 'next/link';
import { AuthFormWrapper } from '@/components/auth/auth-form-wrapper';
import { LoginForm } from '@/components/auth/login-form';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/'); // Redirect to dashboard if already logged in
    }
  }, [user, loading, router]);

  if (loading || (!loading && user)) {
    // Show loading or blank screen while checking auth status or redirecting
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <AuthFormWrapper
      title="Bem-vindo(a) de Volta!"
      description="Faça login para acessar seu painel FinTrack."
      footerContent={
        <p>
          Não tem uma conta?{' '}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Cadastre-se
          </Link>
        </p>
      }
    >
      <LoginForm />
    </AuthFormWrapper>
  );
}
