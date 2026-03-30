'use client';

import { useEffect } from 'react';
import { SplashScreen } from '@capacitor/splash-screen';
import { useAuth } from '@/context/auth-context';

export function SplashController() {
  const { loading } = useAuth();

  useEffect(() => {
    // Esperar o Firebase terminar o carregamento inicial
    if (!loading) {
      // "Cortinas abertas" - esconde a splash screen com fade suave
      SplashScreen.hide({ fadeDuration: 400 });
    }
  }, [loading]);

  return null; // Componente não renderiza nada, apenas controla a splash
}
