
"use client";

import type React from 'react';
import { createContext, useContext, useState, useEffect, useCallback }
  from 'react';

type Language = 'en' | 'pt';

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  translate: (translations: Record<Language, string>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('pt');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const storedLanguage = localStorage.getItem('userLanguage') as Language | null;
    if (storedLanguage && ['en', 'pt'].includes(storedLanguage)) {
      setLanguageState(storedLanguage);
    }
  }, []);

  // Effect to update localStorage whenever the language state changes
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('userLanguage', language);
    }
  }, [language, mounted]);

  // Callback to set the language state
  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang); // This will trigger the useEffect above to save to localStorage
  }, [setLanguageState]); // setLanguageState is stable

  const translate = useCallback((translations: Record<Language, string>): string => {
    return translations[language] || translations['en'] || Object.values(translations)[0] || '';
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, translate }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
