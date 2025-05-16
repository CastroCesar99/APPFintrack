
"use client";

import type React from 'react';
import { useState, useEffect } from 'react';
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { CATEGORIES, type CategoryName } from "@/types";
import { useLanguage } from "@/context/language-context";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useDateNavigation } from '@/context/date-navigation-context';
import { BudgetCategoryItem } from '@/components/budgets/budget-category-item';
import { Separator } from '@/components/ui/separator';
import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { format as formatDateFns } from 'date-fns'; // Renamed to avoid conflict
import { Skeleton } from '@/components/ui/skeleton';
// Added Card, CardHeader, CardContent imports for Skeleton display
import { Card, CardHeader, CardContent } from "@/components/ui/card";


export default function BudgetsPage() {
  const { user, loading: authLoading } = useAuth();
  const { translate } = useLanguage();
  const { displayedDate, displayedMonthYearLabel } = useDateNavigation();
  const { toast } = useToast();

  const [budgets, setBudgets] = useState<Record<CategoryName, string>>({});
  const [isLoadingBudgets, setIsLoadingBudgets] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const expenseCategories = CATEGORIES.filter(cat => cat.type === 'expense');
  const currentMonthYearKey = formatDateFns(displayedDate, 'yyyy-MM');

  useEffect(() => {
    const loadBudgetsForMonth = async () => {
      if (!user) {
        setIsLoadingBudgets(false);
        return;
      }
      setIsLoadingBudgets(true);
      console.log(`BudgetsPage: Loading budgets for user ${user.uid}, month: ${currentMonthYearKey}`);
      const budgetDocRef = doc(db, `users/${user.uid}/budgets/${currentMonthYearKey}`);
      try {
        const docSnap = await getDoc(budgetDocRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          // Detailed log of data found
          console.log(`BudgetsPage: Budget data found for ${currentMonthYearKey}:`, JSON.stringify(data, null, 2));
          const loadedBudgets: Record<CategoryName, string> = {};
          expenseCategories.forEach(cat => {
            if (data[cat.name] !== undefined) {
              loadedBudgets[cat.name] = String(data[cat.name]);
            } else {
              loadedBudgets[cat.name] = ''; // Default to empty string if not set
            }
          });
          setBudgets(loadedBudgets);
        } else {
          // No budget set for this month, initialize with empty strings
          const initialBudgets: Record<CategoryName, string> = {};
          expenseCategories.forEach(cat => {
            initialBudgets[cat.name] = '';
          });
          setBudgets(initialBudgets);
          console.log(`BudgetsPage: No budget document found for ${currentMonthYearKey}. Initializing empty budgets.`);
        }
      } catch (error) {
        console.error("Error loading budgets:", error);
        toast({
          title: translate({ en: "Error Loading Budgets", pt: "Erro ao Carregar Orçamentos" }),
          description: translate({ en: "Could not load your budgets.", pt: "Não foi possível carregar seus orçamentos." }),
          variant: "destructive",
        });
        // Initialize with empty strings on error as well
        const errorBudgets: Record<CategoryName, string> = {};
        expenseCategories.forEach(cat => {
          errorBudgets[cat.name] = '';
        });
        setBudgets(errorBudgets);
      } finally {
        setIsLoadingBudgets(false);
      }
    };

    if (!authLoading && user) {
      loadBudgetsForMonth();
    } else if (!authLoading && !user) {
      // User is not logged in, clear budgets and stop loading
      setBudgets({});
      setIsLoadingBudgets(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, currentMonthYearKey, toast, translate]);

  const handleBudgetChange = (categoryName: CategoryName, amount: string) => {
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
    
    const budgetsToSave = Object.fromEntries(
      Object.entries(budgets)
        .map(([key, value]) => {
          const numValue = parseFloat(value);
          return [key, isNaN(numValue) ? 0 : numValue]; // Save 0 if input is not a valid number
        })
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
  
  const pageTitle = translate({ en: "Budgets", pt: "Orçamentos" });
  const pageDescription = translate({ 
    en: "Set and manage your monthly budgets for each expense category.", 
    pt: "Defina e gerencie seus orçamentos mensais para cada categoria de despesa." 
  });
  const saveButtonLabel = translate({ en: "Save Budgets", pt: "Salvar Orçamentos" });

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
          <Button onClick={handleSaveBudgets} className="w-full sm:w-auto" disabled={isSaving || isLoadingBudgets}>
            {isSaving ? translate({en: "Saving...", pt: "Salvando..."}) : saveButtonLabel}
          </Button>
        </div>
        
        <Separator />

        {isLoadingBudgets ? (
           <div className="grid grid-cols-1 gap-4 p-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {expenseCategories.map(category => (
              <Card key={category.name} className="w-full shadow-lg">
                <CardHeader className="pb-2">
                  <Skeleton className="h-6 w-3/4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : expenseCategories.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 p-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {expenseCategories.map(category => (
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
            {translate({ en: "No expense categories found to set budgets for.", pt: "Nenhuma categoria de despesa encontrada para definir orçamentos."})}
          </p>
        )}
      </div>
    </AppLayout>
  );
}
