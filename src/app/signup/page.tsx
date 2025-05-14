
"use client"; // This page must be a client component

import type React from 'react';
import Link from 'next/link';
import { AuthFormWrapper } from '@/components/auth/auth-form-wrapper';
import { SignupForm } from '@/components/auth/signup-form';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function SignupPage() {
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
      title="Crie Sua Conta FinTrack"
      description="Comece a organizar suas finanças hoje mesmo."
      footerContent={
        <p>
          Já tem uma conta?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Faça Login
          </Link>
        </p>
      }
    >
      <SignupForm />
    </AuthFormWrapper>
  );
}
