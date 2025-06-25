
"use client";

import type React from 'react';
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { format, subMonths, addMonths } from 'date-fns';
import { enUS, ptBR } from 'date-fns/locale';
import { useLanguage } from './language-context';

interface DateNavigationContextType {
  displayedDate: Date;
  displayedMonthYearLabel: string;
  handlePreviousMonth: () => void;
  handleNextMonth: () => void;
  setDisplayedDate: (date: Date) => void;
}

const DateNavigationContext = createContext<DateNavigationContextType | undefined>(undefined);

export function DateNavigationProvider({ children }: { children: React.ReactNode }) {
  const [displayedDate, setDisplayedDate] = useState<Date>(new Date());
  const { language } = useLanguage();
  const [displayedMonthYearLabel, setDisplayedMonthYearLabel] = useState('');

  useEffect(() => {
    const locale = language === 'pt' ? ptBR : enUS;
    const formattedMonth = format(displayedDate, "MMMM yyyy", { locale });
    setDisplayedMonthYearLabel(formattedMonth.charAt(0).toUpperCase() + formattedMonth.slice(1));
  }, [displayedDate, language]);

  const handlePreviousMonth = useCallback(() => {
    setDisplayedDate(current => subMonths(current, 1));
  }, []);

  const handleNextMonth = useCallback(() => {
    setDisplayedDate(current => addMonths(current, 1));
  }, []);

  const value = useMemo(() => ({
    displayedDate,
    displayedMonthYearLabel,
    handlePreviousMonth,
    handleNextMonth,
    setDisplayedDate,
  }), [displayedDate, displayedMonthYearLabel, handlePreviousMonth, handleNextMonth]);

  return (
    <DateNavigationContext.Provider value={value}>
      {children}
    </DateNavigationContext.Provider>
  );
}

export function useDateNavigation(): DateNavigationContextType {
  const context = useContext(DateNavigationContext);
  if (context === undefined) {
    throw new Error('useDateNavigation must be used within a DateNavigationProvider');
  }
  return context;
}
