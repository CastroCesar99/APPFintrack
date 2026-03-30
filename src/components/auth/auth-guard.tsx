"use client";

import { useAuth } from "@/context/auth-context";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

interface AuthGuardProps {
  children: React.ReactNode;
}

const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password'];

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Mover lógica de redirecionamento para useEffect
  useEffect(() => {
    if (loading) return;
    
    const isPublic = PUBLIC_PATHS.includes(pathname);
    
    if (!user && !isPublic) {
      router.replace('/login');
    } else if (user && pathname === '/login') {
      router.replace('/');
    }
  }, [user, loading, pathname, router]);

  // 1. Se estiver carregando, mostra spinner
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] w-full bg-background space-y-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        <p className="text-sm text-muted-foreground animate-pulse">
          Verificando acesso...
        </p>
      </div>
    );
  }

  // 2. Se não estiver logado e não for rota pública, retorna null (redirecionamento pendente)
  if (!user && !PUBLIC_PATHS.includes(pathname)) {
    return null;
  }

  // 3. Se estiver logado e estiver na página de login, retorna null (redirecionamento pendente)
  if (user && pathname === '/login') {
    return null;
  }

  // 4. Para todos os outros casos, renderiza os filhos
  return <>{children}</>;
}
