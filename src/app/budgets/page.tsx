
"use client";

import type React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { CATEGORIES, getCategoryDisplayLabel, type Category, type CustomCategoryData, type DisplayCategory, type UserPreferences, type Transaction, CategoryName } from "@/types";
import { useLanguage } from "@/context/language-context";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useDateNavigation } from '@/context/date-navigation-context';
import { BudgetCategoryItem } from '@/components/budgets/budget-category-item';
import { Separator } from '@/components/ui/separator';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc, serverTimestamp, collection, query, orderBy, onSnapshot, Timestamp } from "firebase/firestore";
import { format as formatDateFns, addMonths, getYear as getYearFns, getMonth as getMonthFns, parse as parseDateFns } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils';
import { DollarSign, TrendingUp } from 'lucide-react';

export default function BudgetsPage() {
  const { user, loading: authLoading } = useAuth();
  const { translate, language } = useLanguage();
  const { displayedDate, displayedMonthYearLabel } = useDateNavigation();
  const { toast } = useToast();

  const [userDisplayCategories, setUserDisplayCategories] = useState<DisplayCategory[]>([]);
  const [budgets, setBudgets] = useState<Record<string, string>>({});
  const [isLoadingPreferencesAndBudgets, setIsLoadingPreferencesAndBudgets] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReplicating, setIsReplicating] = useState(false);

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);

  const currentMonthYearKey = useMemo(() => formatDateFns(displayedDate, 'yyyy-MM'), [displayedDate]);

  const fetchPreferencesAndBudgets = useCallback(async () => {
    if (!user) {
      setIsLoadingPreferencesAndBudgets(false);
      setUserDisplayCategories(CATEGORIES.filter(cat => cat.type === 'expense').sort((a, b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
      setBudgets({});
      return;
    }
    setIsLoadingPreferencesAndBudgets(true);

    let effectiveCategories: DisplayCategory[] = [];
    try {
      const prefsDocRef = doc(db, `users/${user.uid}/preferences/userPreferences`);
      const prefsSnap = await getDoc(prefsDocRef);

      const customMap = new Map<string, CustomCategoryData>();
      let selectedCategoryNames: Set<string> | null = null;

      if (prefsSnap.exists()) {
        const prefsData = prefsSnap.data() as UserPreferences;
        (prefsData.userDefinedCategories || []).forEach(cd => customMap.set(cd.name.toLowerCase(), cd));
        if (prefsData.selectedCategories && prefsData.selectedCategories.length > 0) {
          selectedCategoryNames = new Set(prefsData.selectedCategories.map(name => name.toLowerCase()));
        }
      }

      let candidateCategories: DisplayCategory[] = CATEGORIES.filter(cat => cat.type === 'expense').map(pCat => {
        return customMap.get(pCat.name.toLowerCase()) || pCat;
      });
      
      customMap.forEach((customCat, nameKey) => {
        if (customCat.type === 'expense' && !candidateCategories.some(cc => cc.name.toLowerCase() === nameKey)) {
          candidateCategories.push(customCat);
        }
      });

      if (selectedCategoryNames) {
        effectiveCategories = candidateCategories.filter(cat => selectedCategoryNames!.has(cat.name.toLowerCase()));
      } else {
        effectiveCategories = candidateCategories;
      }
      
      if (effectiveCategories.length === 0) {
          effectiveCategories = CATEGORIES.filter(cat => cat.type === 'expense').map(pCat => customMap.get(pCat.name.toLowerCase()) || pCat);
      }
      
      setUserDisplayCategories(effectiveCategories.sort((a, b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));

      const budgetDocRef = doc(db, `users/${user.uid}/budgets/${currentMonthYearKey}`);
      const budgetSnap = await getDoc(budgetDocRef);
      const newBudgetsState: Record<string, string> = {};
      if (budgetSnap.exists()) {
        const budgetData = budgetSnap.data() as Record<string, number>;
        console.log(`BudgetsPage: Budget data found for ${currentMonthYearKey}:`, JSON.stringify(budgetData, null, 2));
        effectiveCategories.forEach(cat => {
          newBudgetsState[cat.name] = budgetData[cat.name] !== undefined ? String(budgetData[cat.name]) : '';
        });
      } else {
        console.log(`BudgetsPage: No budget document found for ${currentMonthYearKey}. Initializing empty for categories.`);
        effectiveCategories.forEach(cat => {
          newBudgetsState[cat.name] = '';
        });
      }
      setBudgets(newBudgetsState);

    } catch (error) {
      console.error("BudgetsPage: Error loading user preferences or budgets:", error);
      toast({
        title: translate({ en: "Error Loading Data", pt: "Erro ao Carregar Dados" }),
        description: translate({ en: "Could not load your preferences or budgets.", pt: "Não foi possível carregar suas preferências ou orçamentos." }),
        variant: "destructive",
      });
      const fallbackCategories = CATEGORIES.filter(cat => cat.type === 'expense').sort((a, b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language)));
      setUserDisplayCategories(fallbackCategories);
      const errorBudgets: Record<string, string> = {};
      fallbackCategories.forEach(cat => { errorBudgets[cat.name] = ''; });
      setBudgets(errorBudgets);
    } finally {
      setIsLoadingPreferencesAndBudgets(false);
    }
  }, [user, currentMonthYearKey, toast, translate, language]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchPreferencesAndBudgets();
    } else if (!authLoading && !user) {
      setUserDisplayCategories(CATEGORIES.filter(cat => cat.type === 'expense').sort((a,b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
      setBudgets({});
      setIsLoadingPreferencesAndBudgets(false);
    }
  }, [user, authLoading, fetchPreferencesAndBudgets, currentMonthYearKey, language]);

  useEffect(() => {
    if (!user || authLoading) {
      setIsLoadingTransactions(false);
      setAllTransactions([]);
      return;
    }
    setIsLoadingTransactions(true);
    const transactionsColRef = collection(db, `users/${user.uid}/transactions`);
    const q_transactions = query(transactionsColRef, orderBy("date", "desc"));

    const unsubscribe = onSnapshot(q_transactions, (querySnapshot) => {
      const fetchedTransactions = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        let dateString = data.date;
        if (data.date && typeof data.date === 'object' && data.date instanceof Timestamp) {
          dateString = formatDateFns(data.date.toDate(), "yyyy-MM-dd");
        } else if (typeof data.date === 'string' && data.date.includes('T')) { 
          try { dateString = formatDateFns(parseDateFns(data.date, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX", new Date(0)), "yyyy-MM-dd"); } 
          catch (e) { 
            try { dateString = formatDateFns(parseDateFns(data.date, "yyyy-MM-dd'T'HH:mm:ssXXX", new Date(0)), "yyyy-MM-dd"); } 
            catch (e2) {
              try { dateString = formatDateFns(new Date(data.date), "yyyy-MM-dd"); } 
              catch (e3) {
                console.warn("BudgetsPage: Failed to parse date string to yyyy-MM-dd:", data.date, e3);
                dateString = formatDateFns(new Date(), "yyyy-MM-dd");
              }
            }
          }
        } else if (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
           console.warn("BudgetsPage: Transaction has unexpected date format. Fallback to current date. Date was:", data.date);
           dateString = formatDateFns(new Date(), "yyyy-MM-dd"); 
        }

        let effectiveMonthString = data.effectiveMonth;
        if (!effectiveMonthString && dateString) {
            try {
                effectiveMonthString = formatDateFns(parseDateFns(dateString, "yyyy-MM-dd", new Date(0)), "yyyy-MM");
            } catch (e) {
                console.warn(`BudgetsPage: Could not parse date ${dateString} to derive effectiveMonth for tx ${docSnap.id}:`, e);
                effectiveMonthString = formatDateFns(new Date(), "yyyy-MM"); 
            }
        }
        return { ...data, id: docSnap.id, date: dateString, effectiveMonth: effectiveMonthString } as Transaction;
      });
      setAllTransactions(fetchedTransactions);
      setIsLoadingTransactions(false);
    }, (error) => {
      console.error("BudgetsPage: Error fetching transactions:", error);
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "Could not fetch transactions.", pt: "Não foi possível buscar as transações." }), variant: "destructive" });
      setIsLoadingTransactions(false);
    });
    return () => unsubscribe();
  }, [user, authLoading]); 

  const totalIncomeForDisplayedMonth = useMemo(() => {
    console.log("BudgetsPage: Recalculating totalIncomeForDisplayedMonth. Displayed Date:", displayedDate.toISOString(), "Language:", language);
    console.log("BudgetsPage: All transactions before filtering (count):", allTransactions.length);
    // console.log("BudgetsPage: All transactions content:", JSON.stringify(allTransactions.map(t => ({desc: t.description, date: t.date, effMonth: t.effectiveMonth, type: t.type, amount: t.amount}))));


    const targetYear = getYearFns(displayedDate);
    const targetMonth = getMonthFns(displayedDate); // 0-indexed month

    const incomeTransactions = allTransactions.filter(t => {
        if (t.type !== 'income') return false;
        
        let transactionMatchesMonth = false;
        let derivedTransactionYear = -1, derivedTransactionMonth = -1;

        if (t.effectiveMonth && /^\d{4}-\d{2}$/.test(t.effectiveMonth)) {
            const [yearStr, monthStr] = t.effectiveMonth.split('-');
            derivedTransactionYear = parseInt(yearStr, 10);
            derivedTransactionMonth = parseInt(monthStr, 10) - 1; // 0-indexed
            transactionMatchesMonth = (derivedTransactionYear === targetYear && derivedTransactionMonth === targetMonth);
        } else if (t.date && /^\d{4}-\d{2}-\d{2}$/.test(t.date)) {
            const dateParts = t.date.split('-');
            derivedTransactionYear = parseInt(dateParts[0], 10);
            derivedTransactionMonth = parseInt(dateParts[1], 10) - 1;
            transactionMatchesMonth = (derivedTransactionYear === targetYear && derivedTransactionMonth === targetMonth);
        } else {
            console.warn(`BudgetsPage Income Filter (Skipping): Tx ID ${t.id}, Desc: ${t.description}, has no valid effectiveMonth ('${t.effectiveMonth}') or date ('${t.date}').`);
            return false; 
        }
        console.log(`BudgetsPage Income Filter (Processing): Tx ID ${t.id}, Desc: ${t.description}, Type: ${t.type}, EffMonth: ${t.effectiveMonth}, Date: ${t.date} (Parsed as Y:${derivedTransactionYear}, M:${derivedTransactionMonth}), Target Y:${targetYear}, M:${targetMonth}, Matches: ${transactionMatchesMonth}`);
        return transactionMatchesMonth;
      });
    console.log("BudgetsPage: Filtered income transactions for month (count):", incomeTransactions.length);
    return incomeTransactions.reduce((sum, t) => sum + t.amount, 0);
  }, [allTransactions, displayedDate, language]); // Added language as dependency due to console log potentially using it

  const totalBudgetedAmount = useMemo(() => {
    return Object.values(budgets).reduce((sum, valStr) => {
      const valNum = parseFloat(valStr);
      return sum + (isNaN(valNum) ? 0 : valNum);
    }, 0);
  }, [budgets]);

  const handleBudgetChange = (categoryName: string, amount: string) => {
    setBudgets(prevBudgets => ({ ...prevBudgets, [categoryName]: amount }));
  };

  const handleSaveBudgets = async () => {
    if (!user) {
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }), variant: "destructive" });
      return;
    }
    setIsSaving(true);
    const budgetDocRef = doc(db, `users/${user.uid}/budgets/${currentMonthYearKey}`);
    const budgetsToSave = Object.fromEntries(
      Object.entries(budgets)
        .map(([key, value]) => [key, parseFloat(value) || 0])
        .filter(([key]) => userDisplayCategories.some(cat => cat.name === key))
    );
    try {
      await setDoc(budgetDocRef, { ...budgetsToSave, lastUpdated: serverTimestamp() }, { merge: true });
      toast({ title: translate({ en: "Budgets Saved", pt: "Orçamentos Salvos" }), description: `${translate({ en: "Your budgets for", pt: "Seus orçamentos para" })} ${displayedMonthYearLabel} ${translate({ en: "have been saved.", pt: "foram salvos." })}` });
    } catch (error) {
      console.error("BudgetsPage: Error saving budgets:", error);
      toast({ title: translate({ en: "Error Saving Budgets", pt: "Erro ao Salvar Orçamentos" }), description: translate({ en: "Could not save your budgets.", pt: "Não foi possível salvar seus orçamentos." }), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReplicateToNextMonth = async () => {
    if (!user) {
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }), variant: "destructive" });
      return;
    }
    const budgetsToReplicate = Object.fromEntries(
      Object.entries(budgets)
        .map(([key, value]) => [key, parseFloat(value) || 0])
        .filter(([, value]) => value > 0)
        .filter(([key]) => userDisplayCategories.some(cat => cat.name === key))
    );
    if (Object.keys(budgetsToReplicate).length === 0) {
      toast({ title: translate({ en: "No Budgets to Replicate", pt: "Nenhum Orçamento para Replicar" }), description: translate({ en: "Please set some budgets for the current month first.", pt: "Por favor, defina alguns orçamentos para o mês atual primeiro." }), variant: "default" });
      return;
    }
    setIsReplicating(true);
    try {
      const nextMonthDate = addMonths(displayedDate, 1);
      const nextMonthKey = formatDateFns(nextMonthDate, 'yyyy-MM');
      const nextMonthLabel = formatDateFns(nextMonthDate, 'MMMM yyyy', { locale: (language === 'pt' ? require('date-fns/locale/pt-BR').default : require('date-fns/locale/en-US').default) });
      
      const budgetDocRefNextMonth = doc(db, `users/${user.uid}/budgets/${nextMonthKey}`);
      await setDoc(budgetDocRefNextMonth, { ...budgetsToReplicate, lastUpdated: serverTimestamp() }, { merge: true });
      toast({ title: translate({ en: "Budgets Replicated", pt: "Orçamentos Replicados" }), description: `${translate({ en: "Current budgets have been replicated to", pt: "Os orçamentos atuais foram replicados para" })} ${nextMonthLabel}.` });
    } catch (error) {
      console.error("BudgetsPage: Error replicating budgets:", error);
      toast({ title: translate({ en: "Error Replicating Budgets", pt: "Erro ao Replicar Orçamentos" }), description: translate({ en: "Could not replicate your budgets.", pt: "Não foi possível replicar seus orçamentos." }), variant: "destructive" });
    } finally {
      setIsReplicating(false);
    }
  };

  const isLoading = isLoadingPreferencesAndBudgets || isLoadingTransactions;
  const pageTitle = translate({ en: "Budgets", pt: "Orçamentos" });
  const pageDescription = translate({ en: "Set and manage your monthly budgets for each expense category.", pt: "Defina e gerencie seus orçamentos mensais para cada categoria de despesa." });
  const saveButtonLabel = translate({ en: "Save Budgets", pt: "Salvar Orçamentos" });
  const replicateButtonLabel = translate({ en: "Replicate to Next Month", pt: "Replicar para Mês Seguinte" });

  if (authLoading) {
    return <AppLayout><div className="flex items-center justify-center h-full"><p className="text-foreground">{translate({ en: "Loading user...", pt: "Carregando usuário..." })}</p></div></AppLayout>;
  }
  if (!user && !authLoading) {
     return <AppLayout><div className="flex items-center justify-center h-full"><p className="text-foreground">{translate({ en: "Please log in to manage budgets.", pt: "Por favor, faça login para gerenciar orçamentos." })}</p></div></AppLayout>;
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

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>{translate({en: "Monthly Summary", pt: "Resumo Mensal"})}</CardTitle>
            <CardDescription>{translate({en: "Total income and set budget for", pt: "Receita total e orçamento definido para"})} {displayedMonthYearLabel}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {isLoading ? (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : (
              <>
                <div className="flex items-center space-x-3 rounded-md border p-4 bg-background dark:bg-card">
                  <TrendingUp className="h-6 w-6 text-green-500" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {translate({ en: "Total Income", pt: "Receita Total" })}
                    </p>
                    <p className="text-2xl font-bold">{formatCurrency(totalIncomeForDisplayedMonth)}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3 rounded-md border p-4 bg-background dark:bg-card">
                  <DollarSign className="h-6 w-6 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {translate({ en: "Total Budget Set", pt: "Orçamento Total Definido" })}
                    </p>
                    <p className="text-2xl font-bold">{formatCurrency(totalBudgetedAmount)}</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        
        <Separator />

        {isLoadingPreferencesAndBudgets ? (
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
            {translate({ en: "No expense categories selected or defined to set budgets for. Please check your onboarding settings or category management.", pt: "Nenhuma categoria de despesa selecionada ou definida para definir orçamentos. Verifique suas configurações de onboarding ou gerenciamento de categorias."})}
          </p>
        )}
      </div>
    </AppLayout>
  );
}


    