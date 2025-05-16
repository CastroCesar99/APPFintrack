
"use client";

import type React from 'react';
import { useState, useEffect, useMemo } from "react";
import { useRouter } from 'next/navigation';
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TransactionsTable } from "@/components/dashboard/transactions-table";
import { TransactionForm } from "@/components/dashboard/transaction-form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PlusCircle } from "lucide-react";
import type { Transaction } from "@/types";
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { useDateNavigation } from '@/context/date-navigation-context';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { format as formatDateFns, parseISO as parseISODateFns } from 'date-fns';

export default function ExpensesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { translate } = useLanguage();
  const { displayedDate, displayedMonthYearLabel } = useDateNavigation();
  const { toast } = useToast();

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!user || authLoading || !isClient) {
      if (!authLoading && !user && isClient) router.push('/login');
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
          try {
            dateString = formatDateFns(parseISODateFns(data.date), "yyyy-MM-dd");
          } catch (e) {
            console.warn(`ExpensesPage: Failed to parse ISO date string: ${data.date}`, e);
            dateString = formatDateFns(new Date(), "yyyy-MM-dd");
          }
        } else if (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
           console.warn("ExpensesPage: Transaction has unexpected date format. Fallback to current date. Date was:", data.date);
           dateString = formatDateFns(new Date(), "yyyy-MM-dd");
        }
        return { ...data, id: docSnap.id, date: dateString } as Transaction;
      });
      setAllTransactions(fetchedTransactions);
      setIsLoadingTransactions(false);
    }, (error) => {
      console.error("ExpensesPage: Error fetching transactions:", error);
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: translate({ en: "Could not fetch transactions.", pt: "Não foi possível buscar as transações." }),
        variant: "destructive",
      });
      setIsLoadingTransactions(false);
    });

    return () => unsubscribe();
  }, [user, authLoading, isClient, toast, translate, router]);

  const expensesForDisplayedPeriod = useMemo(() => {
    const targetYear = displayedDate.getFullYear();
    const targetMonth = displayedDate.getMonth(); // 0-indexed

    return allTransactions.filter(t => {
      if (t.type !== 'expense') return false;
      const dateParts = t.date.split('-');
      if (dateParts.length !== 3) return false;
      const transactionYear = parseInt(dateParts[0], 10);
      const transactionMonth = parseInt(dateParts[1], 10) - 1;
      return transactionYear === targetYear && transactionMonth === targetMonth;
    });
  }, [allTransactions, displayedDate]);

  const handleAddExpense = async (newTransactionData: Omit<Transaction, "id" | "userId" | "createdAt">) => {
    if (!user) {
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: translate({ en: "User not authenticated.", pt: "Usuário não autenticado." }),
        variant: "destructive",
      });
      return;
    }

    const fullPayload = {
      ...newTransactionData,
      type: 'expense' as 'expense', // Ensure type is explicitly expense
      userId: user.uid,
      createdAt: serverTimestamp(),
    };
    
    const dataToSave = Object.fromEntries(
        Object.entries(fullPayload).filter(([_, value]) => value !== undefined)
    ) as Partial<Transaction & { createdAt: any; userId: string }>;

    if (dataToSave.isRecurring === undefined && typeof newTransactionData.isRecurring === 'boolean') {
        dataToSave.isRecurring = newTransactionData.isRecurring;
    } else if (dataToSave.isRecurring === undefined) {
       dataToSave.isRecurring = false; 
    }


    try {
      const transactionsColRef = collection(db, `users/${user.uid}/transactions`);
      await addDoc(transactionsColRef, dataToSave);
      toast({
        title: translate({ en: "Expense Added", pt: "Despesa Adicionada" }),
        description: `${newTransactionData.description} ${translate({ en: "has been successfully added.", pt: "foi adicionada com sucesso." })}`,
      });
      setIsAddFormOpen(false); // Close dialog on success
    } catch (error: any) {
      console.error("ExpensesPage: Error adding expense:", error);
      toast({
        title: translate({ en: "Error Adding Expense", pt: "Erro ao Adicionar Despesa" }),
        description: (error.message || translate({ en: "Could not add expense.", pt: "Não foi possível adicionar a despesa." })) + (error.code ? ` (Code: ${error.code})` : ''),
        variant: "destructive",
      });
    }
  };
  
  const handleEditTransaction = (transactionId: string) => {
    toast({
      title: translate({ en: "Feature In Development", pt: "Funcionalidade em Desenvolvimento" }),
      description: `${translate({en:"Editing transaction",pt:"Editar transação"})} ID: ${transactionId} ${translate({en:"is coming soon.", pt:"está chegando em breve."})}`
    });
  };

  const handleDeleteTransaction = (transactionId: string) => {
     toast({
      title: translate({ en: "Feature In Development", pt: "Funcionalidade em Desenvolvimento" }),
      description: `${translate({en:"Deleting transaction",pt:"Excluir transação"})} ID: ${transactionId} ${translate({en:"is coming soon.", pt:"está chegando em breve."})}`
    });
  };


  if (!isClient || authLoading || isLoadingTransactions) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-foreground">{translate({ en: "Loading expenses...", pt: "Carregando despesas..." })}</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {translate({ en: "Expenses", pt: "Despesas" })} - {displayedMonthYearLabel}
          </h1>
          <Dialog open={isAddFormOpen} onOpenChange={setIsAddFormOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">
                <PlusCircle className="mr-2 h-4 w-4" />
                {translate({ en: "Add New Expense", pt: "Adicionar Nova Despesa" })}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{translate({ en: "New Expense", pt: "Nova Despesa" })}</DialogTitle>
                <DialogDescription>
                  {translate({ en: "Fill in the details for your new expense.", pt: "Preencha os detalhes da sua nova despesa." })}
                </DialogDescription>
              </DialogHeader>
              <TransactionForm
                onAddTransaction={handleAddExpense}
                initialType="expense"
                defaultDate={displayedDate}
                key={displayedDate.toISOString()} // Force re-mount on date change
              />
            </DialogContent>
          </Dialog>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>{translate({ en: "Expense List", pt: "Lista de Despesas" })}</CardTitle>
            <CardDescription>
              {translate({ en: "All your expenses for", pt: "Todas as suas despesas de" })} {displayedMonthYearLabel}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {expensesForDisplayedPeriod.length > 0 ? (
              <TransactionsTable 
                transactions={expensesForDisplayedPeriod} 
                onEditTransaction={handleEditTransaction}
                onDeleteTransaction={handleDeleteTransaction}
              />
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {translate({ en: "No expenses recorded for this period.", pt: "Nenhuma despesa registrada para este período." })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

    