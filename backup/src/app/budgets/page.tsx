
"use client";

import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { CATEGORIES, getCategoryDisplayLabel, type Category, type CustomCategoryData, type DisplayCategory, type UserPreferences } from "@/types";
import { useLanguage } from "@/context/language-context";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useDateNavigation } from '@/context/date-navigation-context';
import { BudgetCategoryItem } from '@/components/budgets/budget-category-item';
import { Separator } from '@/components/ui/separator';
import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { format as formatDateFns, addMonths } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardContent } from "@/components/ui/card";

export default function BudgetsPage() {
  const { user, loading: authLoading } = useAuth();
  const { translate } = useLanguage();
  const { displayedDate, displayedMonthYearLabel } = useDateNavigation();
  const { toast } = useToast();

  const [userDisplayCategories, setUserDisplayCategories] = useState<DisplayCategory[]>([]);
  const [budgets, setBudgets] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReplicating, setIsReplicating] = useState(false);

  const currentMonthYearKey = formatDateFns(displayedDate, 'yyyy-MM');

  const fetchPreferencesAndBudgets = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      setUserDisplayCategories([]);
      setBudgets({});
      return;
    }
    setIsLoading(true);

    let effectiveCategories: DisplayCategory[] = [];

    try {
      const prefsDocRef = doc(db, `users/${user.uid}/preferences/userPreferences`);
      const prefsSnap = await getDoc(prefsDocRef);

      if (prefsSnap.exists()) {
        const prefsData = prefsSnap.data() as UserPreferences;
        const selectedNames = prefsData.selectedCategories || [];
        const customDefs = prefsData.userDefinedCategories || [];
        
        const customMap = new Map(customDefs.map(cd => [cd.name, cd]));

        selectedNames.forEach(name => {
          const predefinedCat = CATEGORIES.find(pCat => pCat.name === name && pCat.type === 'expense');
          if (predefinedCat) {
            effectiveCategories.push(predefinedCat);
          } else if (customMap.has(name)) {
            const customCat = customMap.get(name);
            if (customCat && customCat.type === 'expense') {
                 effectiveCategories.push(customCat);
            }
          }
        });
        if (effectiveCategories.length === 0 && CATEGORIES.filter(cat => cat.type === 'expense').length > 0) {
            effectiveCategories = CATEGORIES.filter(cat => cat.type === 'expense');
        }
      } else {
        // If no preferences, default to all predefined expense categories
        effectiveCategories = CATEGORIES.filter(cat => cat.type === 'expense');
      }
    } catch (error) {
      console.error("Error loading user preferences:", error);
      toast({
        title: translate({ en: "Error Loading Preferences", pt: "Erro ao Carregar Preferências" }),
        description: translate({ en: "Could not load your category preferences.", pt: "Não foi possível carregar suas preferências de categoria." }),
        variant: "destructive",
      });
      effectiveCategories = CATEGORIES.filter(cat => cat.type === 'expense');
    }
    
    setUserDisplayCategories(effectiveCategories);

    const budgetDocRef = doc(db, `users/${user.uid}/budgets/${currentMonthYearKey}`);
    try {
      const budgetSnap = await getDoc(budgetDocRef);
      const newBudgetsState: Record<string, string> = {};
      
      if (budgetSnap.exists()) {
        const budgetData = budgetSnap.data() as Record<string, number>; // Firestore stores numbers
        console.log(`BudgetsPage: Budget data found for ${currentMonthYearKey}:`, JSON.stringify(budgetData, null, 2));
        effectiveCategories.forEach(cat => {
          newBudgetsState[cat.name] = budgetData[cat.name] !== undefined ? String(budgetData[cat.name]) : '';
        });
      } else {
        console.log(`BudgetsPage: No budget document found for ${currentMonthYearKey}. Initializing empty budgets for categories.`);
        effectiveCategories.forEach(cat => {
          newBudgetsState[cat.name] = '';
        });
      }
      setBudgets(newBudgetsState);
    } catch (error) {
      console.error("Error loading budgets for month:", error);
      toast({
        title: translate({ en: "Error Loading Budgets", pt: "Erro ao Carregar Orçamentos" }),
        description: translate({ en: "Could not load your budgets for this month.", pt: "Não foi possível carregar seus orçamentos para este mês." }),
        variant: "destructive",
      });
      const errorBudgets: Record<string, string> = {};
      effectiveCategories.forEach(cat => {
        errorBudgets[cat.name] = '';
      });
      setBudgets(errorBudgets);
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentMonthYearKey, toast, translate]); 

  useEffect(() => {
    if (!authLoading && user) {
      fetchPreferencesAndBudgets();
    } else if (!authLoading && !user) {
      // Not logged in, clear data and stop loading
      setUserDisplayCategories([]);
      setBudgets({});
      setIsLoading(false);
    }
  }, [user, authLoading, fetchPreferencesAndBudgets]);


  const handleBudgetChange = (categoryName: string, amount: string) => {
    setBudgets(prevBudgets => ({
      ...prevBudgets,
      [categoryName]: amount,
    }));
  };

  const handleSaveBudgets = async () => {
    if (!user) {
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }),
        variant: "destructive",
      });
      return;
    }
    setIsSaving(true);

    const budgetDocRef = doc(db, `users/${user.uid}/budgets/${currentMonthYearKey}`);
    
    // Prepare data for saving: convert to numbers, filter out non-displayed or empty
    const budgetsToSave = Object.fromEntries(
      Object.entries(budgets)
        .map(([key, value]) => {
          const numValue = parseFloat(value);
          // Save 0 if empty or NaN, otherwise the parsed number
          return [key, isNaN(numValue) ? 0 : numValue]; 
        })
        .filter(([key]) => userDisplayCategories.some(cat => cat.name === key))
    );

    try {
      await setDoc(budgetDocRef, { ...budgetsToSave, lastUpdated: serverTimestamp() }, { merge: true });
      toast({
        title: translate({ en: "Budgets Saved", pt: "Orçamentos Salvos" }),
        description: translate({ en: "Your budgets for", pt: "Seus orçamentos para" }) + ` ${displayedMonthYearLabel} ` + translate({ en: "have been saved.", pt: "foram salvos." }),
      });
    } catch (error) {
      console.error("Error saving budgets:", error);
      toast({
        title: translate({ en: "Error Saving Budgets", pt: "Erro ao Salvar Orçamentos" }),
        description: translate({ en: "Could not save your budgets.", pt: "Não foi possível salvar seus orçamentos." }),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReplicateToNextMonth = async () => {
    if (!user) {
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }), variant: "destructive" });
      return;
    }

    // Only replicate budgets that have a valid positive value
    const budgetsToReplicate = Object.fromEntries(
      Object.entries(budgets)
        .map(([key, value]) => {
          const numValue = parseFloat(value);
          // Only include if it's a valid number and greater than 0
          return [key, isNaN(numValue) || numValue <= 0 ? undefined : numValue];
        })
        .filter(([, value]) => value !== undefined) // Remove entries where value became undefined
        .filter(([key]) => userDisplayCategories.some(cat => cat.name === key)) // Ensure it's a displayed category
    );

    if (Object.keys(budgetsToReplicate).length === 0) {
      toast({ title: translate({ en: "No Budgets to Replicate", pt: "Nenhum Orçamento para Replicar" }), description: translate({ en: "Please set some budgets for the current month first.", pt: "Por favor, defina alguns orçamentos para o mês atual primeiro." }), variant: "default" });
      return;
    }
    
    setIsReplicating(true);
    try {
      const nextMonthDate = addMonths(displayedDate, 1);
      const nextMonthKey = formatDateFns(nextMonthDate, 'yyyy-MM');
      const nextMonthLabel = formatDateFns(nextMonthDate, 'MMMM yyyy', { locale: translate({en: undefined, pt: require('date-fns/locale/pt-BR').default}) || require('date-fns/locale/en-US').default });


      const budgetDocRef = doc(db, `users/${user.uid}/budgets/${nextMonthKey}`);
      await setDoc(budgetDocRef, { ...budgetsToReplicate, lastUpdated: serverTimestamp() }, { merge: true });

      toast({
        title: translate({ en: "Budgets Replicated", pt: "Orçamentos Replicados" }),
        description: translate({ en: "Current budgets have been replicated to", pt: "Os orçamentos atuais foram replicados para" }) + ` ${nextMonthLabel}.`,
      });

    } catch (error) {
      console.error("Error replicating budgets:", error);
      toast({
        title: translate({ en: "Error Replicating Budgets", pt: "Erro ao Replicar Orçamentos" }),
        description: translate({ en: "Could not replicate your budgets.", pt: "Não foi possível replicar seus orçamentos." }),
        variant: "destructive",
      });
    } finally {
      setIsReplicating(false);
    }
  };
  
  const pageTitle = translate({ en: "Budgets", pt: "Orçamentos" });
  const pageDescription = translate({ 
    en: "Set and manage your monthly budgets for each expense category.", 
    pt: "Defina e gerencie seus orçamentos mensais para cada categoria de despesa." 
  });
  const saveButtonLabel = translate({ en: "Save Budgets", pt: "Salvar Orçamentos" });
  const replicateButtonLabel = translate({ en: "Replicate to Next Month", pt: "Replicar para Mês Seguinte" });


  if (authLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-foreground">{translate({ en: "Loading user...", pt: "Carregando usuário..." })}</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {pageTitle} - {displayedMonthYearLabel}
            </h1>
            <p className="text-muted-foreground">{pageDescription}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button onClick={handleSaveBudgets} className="w-full sm:w-auto" disabled={isSaving || isLoading || isReplicating}>
              {isSaving ? translate({en: "Saving...", pt: "Salvando..."}) : saveButtonLabel}
            </Button>
            <Button onClick={handleReplicateToNextMonth} variant="outline" className="w-full sm:w-auto" disabled={isSaving || isLoading || isReplicating}>
              {isReplicating ? translate({en: "Replicating...", pt: "Replicando..."}) : replicateButtonLabel}
            </Button>
          </div>
        </div>
        
        <Separator />

        {isLoading ? (
           <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {(userDisplayCategories.length > 0 ? userDisplayCategories : Array(10).fill(0)).map((_, index) => (
              <Card key={index} className="w-full shadow-lg">
                <CardHeader className="pb-2">
                  <Skeleton className="h-6 w-3/4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : userDisplayCategories.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {userDisplayCategories.map(category => (
              <BudgetCategoryItem
                key={category.name}
                category={category}
                value={budgets[category.name] || ''}
                onBudgetChange={handleBudgetChange}
              />
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">
            {translate({ en: "No expense categories selected or defined to set budgets for. Please check your onboarding settings.", pt: "Nenhuma categoria de despesa selecionada ou definida para definir orçamentos. Verifique suas configurações de onboarding."})}
          </p>
        )}
      </div>
    </AppLayout>
  );
}
