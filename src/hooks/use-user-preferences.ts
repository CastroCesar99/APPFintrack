
import { useState, useEffect, useMemo } from 'react';
import useSWR from 'swr';
import { getUserPreferences } from '@/lib/firebase/firestore';
import type { UserPreferences, DisplayCategory, DisplayPaymentMethod, TransactionType } from '@/types';
import { defaultCategories, defaultPaymentMethods } from '@/config/defaults';
import { useLanguage } from '@/context/language-context';

// The fetcher function for SWR
const fetchUserPreferences = async (uid: string): Promise<UserPreferences | null> => {
  if (!uid) return null;
  return await getUserPreferences(uid);
};

export function useUserPreferences(uid: string | undefined) {
  const { language } = useLanguage();
  const { data: preferences, error, isLoading, mutate } = useSWR(uid ? `user_preferences_${uid}` : null, () => fetchUserPreferences(uid!));

  const mergedCategories = useMemo(() => {
    const customCategories = preferences?.customCategories || [];
    const allCategories = [...defaultCategories, ...customCategories].map(category => ({
      ...category,
      displayLabel: language === 'pt' ? category.label.pt : category.label.en,
    }));
    // Deduplicate based on 'name', custom categories override default ones
    const categoryMap = new Map<string, DisplayCategory>();
    allCategories.forEach(cat => categoryMap.set(cat.name, cat));
    return Array.from(categoryMap.values());
  }, [preferences?.customCategories, language]);

  const userCategories = useMemo(() => mergedCategories, [mergedCategories]);

  const userPaymentMethods = useMemo(() => {
    const customPaymentMethods = preferences?.customPaymentMethods || [];
    const allMethods = [...defaultPaymentMethods, ...customPaymentMethods].map(method => ({
      ...method,
      displayLabel: language === 'pt' ? method.label.pt : method.label.en,
    }));
    // Deduplicate based on 'name', custom methods override default ones
    const methodMap = new Map<string, DisplayPaymentMethod>();
    allMethods.forEach(pm => methodMap.set(pm.name, pm));
    return Array.from(methodMap.values());
  }, [preferences?.customPaymentMethods, language]);

  const getCategoryDisplayLabel = (categoryName: string, type: TransactionType): string => {
    const category = userCategories.find(c => c.name === categoryName && c.type === type);
    return category ? (language === 'pt' ? category.label.pt : category.label.en) : categoryName;
  };

  const getPaymentMethodDisplayLabel = (methodName: string): string => {
    const method = userPaymentMethods.find(m => m.name === methodName);
    return method ? (language === 'pt' ? method.label.pt : method.label.en) : methodName;
  };

  return {
    userCategories,
    userPaymentMethods,
    isSubscriptionActive: preferences?.isSubscriptionActive ?? false,
    loading: isLoading,
    error,
    getCategoryDisplayLabel,
    getPaymentMethodDisplayLabel,
    // Expose mutate to allow for manual re-fetching/re-validation if needed elsewhere
    mutatePreferences: mutate, 
  };
}
