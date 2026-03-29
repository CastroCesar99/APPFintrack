"use client";

import { useAuth } from "@/context/auth-context";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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

  useEffect(() => {
    if (loading) return;

    const isPublicPath = PUBLIC_PATHS.includes(pathname);
    const isAuthStepPath = AUTH_STEP_PATHS.includes(pathname);

    // 1. Not logged in
    if (!user) {
      if (!isPublicPath) {
        console.log("AuthGuard: No user, redirecting to /login from", pathname);
        router.push('/login');
      } else {
        setIsReady(true);
      }
      return;
    }

    // 2. Logged in, check verification
    // Google/Social users usually have emailVerified = true
    if (!user.emailVerified) {
      if (pathname !== '/verify-email') {
        console.log("AuthGuard: Email not verified, redirecting to /verify-email");
        router.push('/verify-email');
      } else {
        setIsReady(true);
      }
      return;
    }

    // 3. Verified, check onboarding
    if (!isOnboarded) {
      if (pathname !== '/onboarding') {
        console.log("AuthGuard: Not onboarded, redirecting to /onboarding");
        router.push('/onboarding');
      } else {
        setIsReady(true);
      }
      return;
    }

    // 4. Everything ready
    if (isPublicPath || isAuthStepPath) {
      console.log("AuthGuard: User ready, redirecting from public/step path to /");
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
