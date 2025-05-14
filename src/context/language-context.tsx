
"use client";

import type React from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

type Language = 'en' | 'pt';

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  translate: (translations: Record<Language, string>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('pt'); // Default to Portuguese

  // Memoize setLanguage correctly, ensuring it has access to the latest setLanguageState
  const setLanguage = useCallback((lang: Language) => {
    localStorage.setItem('userLanguage', lang);
    setLanguageState(lang);
  }, [setLanguageState]); // setLanguageState is stable, listing it is best practice

  useEffect(() => {
    const storedLanguage = localStorage.getItem('userLanguage') as Language | null;
    if (storedLanguage && ['en', 'pt'].includes(storedLanguage)) {
      setLanguage(storedLanguage); // Use the memoized setLanguage to initialize
    }
  }, [setLanguage]); // Depend on the memoized setLanguage

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

