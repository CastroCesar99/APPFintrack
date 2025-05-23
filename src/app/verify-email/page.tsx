"use client";

import type React from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { sendEmailVerification } from 'firebase/auth';

export default function VerifyEmailPage() {
  const { user, loading, reloadUser, logOut } = useAuth();
  const { translate } = useLanguage();
  const router = useRouter();
  const { toast } = useToast();
  const [isChecking, setIsChecking] = useState(false);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    } else if (!loading && user && user.emailVerified) {
      router.push('/onboarding'); // Onboarding will then redirect to '/' if complete
    }
  }, [user, loading, router]);

  const handleCheckVerification = async () => {
    setIsChecking(true);
    try {
      await reloadUser(); // This should trigger onAuthStateChanged with updated user.emailVerified
      // The useEffect above will handle redirection if emailVerified becomes true.
      // Check directly after reload as well for quicker feedback
      const updatedUser = auth.currentUser; // auth is from firebase/auth directly or from useAuth()
      if (updatedUser?.emailVerified) {
        toast({
          title: translate({ en: "Email Verified!", pt: "E-mail Verificado!" }),
          description: translate({ en: "Proceeding to setup...", pt: "Prosseguindo para a configuração..." }),
        });
        router.push('/onboarding');
      } else {
         toast({
          title: translate({ en: "Verification Pending", pt: "Verificação Pendente" }),
          description: translate({ en: "Your email is still not verified. Please check your inbox (and spam folder).", pt: "Seu e-mail ainda não foi verificado. Por favor, verifique sua caixa de entrada (e pasta de spam)." }),
          variant: "default",
        });
      }
    } catch (error) {
      console.error("Error reloading user for verification check:", error);
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: translate({ en: "Could not check verification status. Please try again.", pt: "Não foi possível verificar o status. Tente novamente." }),
        variant: "destructive",
      });
    } finally {
      setIsChecking(false);
    }
  };

  const handleResendVerification = async () => {
    if (!user) return;
    setIsResending(true);
    try {
      await sendEmailVerification(user);
      toast({
        title: translate({ en: "Verification Email Resent", pt: "E-mail de Verificação Reenviado" }),
        description: translate({ en: "A new verification email has been sent to", pt: "Um novo e-mail de verificação foi enviado para" }) + ` ${user.email}.`,
      });
    } catch (error) {
      console.error("Error resending verification email:", error);
      toast({
        title: translate({ en: "Error Resending Email", pt: "Erro ao Reenviar E-mail" }),
        description: translate({ en: "Could not resend verification email. Please try again later.", pt: "Não foi possível reenviar o e-mail de verificação. Tente mais tarde." }),
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  };

  if (loading || (!loading && user && user.emailVerified)) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-foreground">{translate({ en: "Loading...", pt: "Carregando..." })}</p>
      </div>
    );
  }

  if (!user) { // Should be caught by useEffect, but as a fallback
     return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-foreground">{translate({ en: "Redirecting to login...", pt: "Redirecionando para o login..." })}</p>
      </div>
    );
  }


  return (
    <div className="w-full min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {translate({ en: "Verify Your Email Address", pt: "Verifique Seu Endereço de E-mail" })}
          </CardTitle>
          <CardDescription>
            {translate({ en: "A verification email has been sent to", pt: "Um e-mail de verificação foi enviado para" })} <strong>{user.email}</strong>.
            <br />
            {translate({ en: "Please check your inbox (and spam folder) and click the link to activate your account.", pt: "Por favor, verifique sua caixa de entrada (e pasta de spam) e clique no link para ativar sua conta." })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={handleCheckVerification} 
            className="w-full"
            disabled={isChecking || isResending}
          >
            {isChecking ? translate({ en: "Checking...", pt: "Verificando..."}) : translate({ en: "I've Verified My Email", pt: "Já Verifiquei Meu E-mail" })}
          </Button>
          <Button 
            onClick={handleResendVerification} 
            variant="outline" 
            className="w-full"
            disabled={isResending || isChecking}
          >
            {isResending ? translate({ en: "Resending...", pt: "Reenviando..."}) : translate({ en: "Resend Verification Email", pt: "Reenviar E-mail de Verificação" })}
          </Button>
          <div className="text-center text-sm">
            <Button variant="link" asChild onClick={logOut}>
              <Link href="/login">
                {translate({ en: "Back to Login", pt: "Voltar para o Login" })}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Need to get auth from firebase/auth for the direct check
import { auth } from "@/lib/firebase";