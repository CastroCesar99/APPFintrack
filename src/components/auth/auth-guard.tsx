"use client";

import { useAuth } from "@/context/auth-context";
import { usePathname } from "next/navigation";

interface AuthGuardProps {
  children: React.ReactNode;
}

const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password'];

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

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

  // 2. Se não estiver logado e não for rota pública, redireciona para login
  if (!user && !PUBLIC_PATHS.includes(pathname)) {
    window.location.href = '/login';
    return null;
  }

  // 3. Para todos os outros casos, renderiza os filhos
  return <>{children}</>;
}
