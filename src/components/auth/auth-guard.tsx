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
  const { user, loading, isOnboarded } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isReady, setIsReady] = useState(false);
  const redirectCountRef = useRef(0);

  useEffect(() => {
    console.log(`AuthGuard: Running. Path: ${pathname}, Loading: ${loading}, User: ${user?.uid}, Onboarded: ${isOnboarded}`);
    
    if (loading) return;

    // Prevention of infinite loops
    if (redirectCountRef.current > 10) {
      console.error("AuthGuard: Infinite redirect loop detected. Stopping.");
      return; 
    }

    const isPublicPath = PUBLIC_PATHS.includes(pathname);
    const isAuthStepPath = AUTH_STEP_PATHS.includes(pathname);

    // 1. Not logged in
    if (!user) {
      if (!isPublicPath) {
        redirectCountRef.current += 1;
        router.push('/login');
      } else {
        setIsReady(true);
      }
      return;
    }

    // 2. Logged in, check verification
    if (!user.emailVerified) {
      if (pathname !== '/verify-email') {
        redirectCountRef.current += 1;
        router.push('/verify-email');
      } else {
        setIsReady(true);
      }
      return;
    }

    // 3. Verified, check onboarding
    if (!isOnboarded) {
      if (pathname !== '/onboarding') {
        redirectCountRef.current += 1;
        router.push('/onboarding');
      } else {
        setIsReady(true);
      }
      return;
    }

    // 4. Everything ready
    if (isPublicPath || isAuthStepPath) {
      console.log("AuthGuard: Finalizing flow, redirecting to /");
      redirectCountRef.current += 1;
      router.push('/');
    } else {
      setIsReady(true);
    }

  }, [user, loading, isOnboarded, pathname, router]);

  if (loading || !isReady) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen w-full bg-background space-y-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        <p className="text-sm text-muted-foreground animate-pulse">
          {!user ? "Verificando acesso..." : !user.emailVerified ? "Aguardando verificação..." : "Carregando perfil..."}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
