"use client";

import { useAuth } from "@/context/auth-context";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";

interface AuthGuardProps {
  children: React.ReactNode;
}

const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password'];
const AUTH_STEP_PATHS = ['/verify-email', '/onboarding'];

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading, isFetchingProfile, isOnboarded } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isReady, setIsReady] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const isRedirecting = useRef(false);
  useEffect(() => {
    // Escape Hatch Timeout (5 Segundos)
    const fallbackTimer = setTimeout(() => {
      setShowFallback(true);
    }, 5000);
    return () => clearTimeout(fallbackTimer);
  }, []);

  useEffect(() => {
    // 1. Trava de Segurança
    if (loading || isRedirecting.current) return;

    const isPublicPath = PUBLIC_PATHS.includes(pathname);
    const isAuthStepPath = AUTH_STEP_PATHS.includes(pathname);

    // 2. Não logado: Redireciona IMPLACAVELMENTE (Early Return)
    if (!user) {
      if (!isPublicPath) {
        console.log("AuthGuard: Unauthenticated. Immediate redirection to /login.");
        isRedirecting.current = true;
        router.replace('/login');
        
        const timeout = setTimeout(() => { isRedirecting.current = false; }, 500);
        return () => clearTimeout(timeout);
      } else {
        if (!isReady) setIsReady(true);
      }
      return; // "Pare o fluxo ali mesmo" - User instruction
    }

    // BLOQUEIO DO FIRESTORE (Aguardando Perfil Completo)
    if (user && isFetchingProfile) {
       console.log("AuthGuard: Usuário autenticado, aguardando download do perfil Firestore antes de decidir rotas...");
       return; // Apenas renderiza o spinner até o isFetchingProfile virar false via onSnapshot
    }

    // 3. Logado: Lógica Dinâmica (Totalmente Carregado)
    let targetRoute: string | null = null;
    if (!user.emailVerified && pathname !== '/verify-email') {
      targetRoute = '/verify-email';
    } else if (user.emailVerified && !isOnboarded && pathname !== '/onboarding') {
      targetRoute = '/onboarding';
    } else if (user.emailVerified && isOnboarded && (isPublicPath || isAuthStepPath)) {
      if (pathname !== '/') targetRoute = '/';
    }

    // 4. Execução das Mudanças do Logado (Com bypass do Swift Bug do iOS)
    if (targetRoute) {
      isRedirecting.current = true;
      
      // Delay tático rápido apenas para logs de usuário via Firestore Snapshot (Swift Bug)
      setTimeout(() => {
        router.replace(targetRoute as string);
      }, 50);
      
      const timeout = setTimeout(() => { isRedirecting.current = false; }, 500);
      return () => clearTimeout(timeout);
    } else {
      if (!isReady) setIsReady(true);
    }

  }, [user, loading, isFetchingProfile, isOnboarded, pathname, router, isReady]);

  if (loading || isFetchingProfile || !isReady) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] w-full bg-background space-y-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        <p className="text-sm text-muted-foreground animate-pulse">
          {!user ? "Verificando acesso..." : !user.emailVerified ? "Aguardando verificação..." : "Carregando perfil..."}
        </p>
        
        {/* Escape Hatch */}
        {showFallback && (
          <button 
            onClick={() => router.replace('/')} 
            className="mt-4 text-sm text-gray-500 underline active:opacity-50"
          >
            Demorando muito? Clique aqui para acessar o painel.
          </button>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
