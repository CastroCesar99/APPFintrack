
"use client";

import type React from 'react';
import { useState, useEffect } from 'react';
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
// import { Input } from '@/components/ui/input'; // Removed problematic import
import { CATEGORIES, getCategoryLabel, type Category, type CategoryName } from "@/types";
import { useLanguage } from "@/context/language-context";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useDateNavigation } from '@/context/date-navigation-context';
import { BudgetCategoryItem } from '@/components/budgets/budget-category-item';
import { Separator } from '@/components/ui/separator';
// Firebase imports for future save/load
// import { db } from '@/lib/firebase';
// import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
// import { format, getMonth, getYear } from 'date-fns';

export default function BudgetsPage() {
  const { user, loading: authLoading } = useAuth();
  const { language, translate } = useLanguage();
  const { displayedDate, displayedMonthYearLabel } = useDateNavigation();
  const { toast } = useToast();

  const [budgets, setBudgets] = useState<Record<CategoryName, string>>({});
  const [isLoading, setIsLoading] = useState(true); // For future data loading

  const expenseCategories = CATEGORIES.filter(cat => cat.type === 'expense');

  // Placeholder for loading budgets - replace with Firestore logic later
  useEffect(() => {
    if (user) {
      // const currentMonthYearKey = format(displayedDate, 'yyyy-MM');
      // console.log(`Fetching budgets for user ${user.uid}, month: ${currentMonthYearKey}`);
      // Example: loadBudgetsForMonth(currentMonthYearKey);
      setIsLoading(false); // Assume loading is done for now
    }
  }, [user, displayedDate]);

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

    // const currentMonthYearKey = format(displayedDate, 'yyyy-MM');
    // const budgetDocRef = doc(db, `users/${user.uid}/budgets/${currentMonthYearKey}`);
    // const budgetsToSave = Object.fromEntries(
    //   Object.entries(budgets).map(([key, value]) => [key, parseFloat(value) || 0])
    // );

    // try {
    //   await setDoc(budgetDocRef, { ...budgetsToSave, lastUpdated: serverTimestamp() }, { merge: true });
    //   toast({
    //     title: translate({ en: "Budgets Saved", pt: "Orçamentos Salvos" }),
    //     description: translate({ en: "Your budgets for", pt: "Seus orçamentos para" }) + ` ${displayedMonthYearLabel} ` + translate({ en: "have been saved.", pt: "foram salvos." }),
    //   });
    // } catch (error) {
    //   console.error("Error saving budgets:", error);
    //   toast({
    //     title: translate({ en: "Error Saving Budgets", pt: "Erro ao Salvar Orçamentos" }),
    //     description: translate({ en: "Could not save your budgets.", pt: "Não foi possível salvar seus orçamentos." }),
    //     variant: "destructive",
    //   });
    // }

    // For now, just a toast
    console.log("Current budget state:", budgets);
    toast({
      title: translate({ en: "Feature In Development", pt: "Funcionalidade em Desenvolvimento" }),
      description: translate({ en: "Saving budgets is coming soon.", pt: "Salvar orçamentos estará disponível em breve."}) + ` (${displayedMonthYearLabel})`,
    });
  };
  
  const pageTitle = translate({ en: "Budgets", pt: "Orçamentos" });
  const pageDescription = translate({ 
    en: "Set and manage your monthly budgets for each expense category.", 
    pt: "Defina e gerencie seus orçamentos mensais para cada categoria de despesa." 
  });
  const saveButtonLabel = translate({ en: "Save Budgets", pt: "Salvar Orçamentos" });

  if (authLoading || isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-foreground">{translate({ en: "Loading budgets...", pt: "Carregando orçamentos..." })}</p>
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
          <Button onClick={handleSaveBudgets} className="w-full sm:w-auto">
            {saveButtonLabel}
          </Button>
        </div>
        
        <Separator />

        {expenseCategories.length > 0 ? (
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
