
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"; // AlertDialogTrigger was removed as it's not directly used.
import { PlusCircle } from "lucide-react"; // Trash2 icon was removed as it's handled by TransactionsTable
import type { Transaction } from "@/types";
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { useDateNavigation } from '@/context/date-navigation-context';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, Timestamp, doc, deleteDoc } from "firebase/firestore";
import { format as formatDateFns, parseISO as parseISODateFns } from 'date-fns';
import { formatCurrency } from '@/lib/utils';

export default function IncomePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { translate } = useLanguage();
  const { displayedDate, displayedMonthYearLabel } = useDateNavigation();
  const { toast } = useToast();

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);

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
            console.warn(`IncomePage: Failed to parse ISO date string: ${data.date}`, e);
            dateString = formatDateFns(new Date(), "yyyy-MM-dd");
          }
        } else if (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
           console.warn("IncomePage: Transaction has unexpected date format. Fallback to current date. Date was:", data.date);
           dateString = formatDateFns(new Date(), "yyyy-MM-dd");
        }
        return { ...data, id: docSnap.id, date: dateString } as Transaction;
      });
      setAllTransactions(fetchedTransactions);
      setIsLoadingTransactions(false);
    }, (error) => {
      console.error("IncomePage: Error fetching transactions:", error);
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: translate({ en: "Could not fetch transactions.", pt: "Não foi possível buscar as transações." }),
        variant: "destructive",
      });
      setIsLoadingTransactions(false);
    });

    return () => unsubscribe();
  }, [user, authLoading, isClient, toast, translate, router]);

  const incomeForDisplayedPeriod = useMemo(() => {
    const targetYear = displayedDate.getFullYear();
    const targetMonth = displayedDate.getMonth(); // 0-indexed

    return allTransactions.filter(t => {
      if (t.type !== 'income') return false;
      const dateParts = t.date.split('-');
      if (dateParts.length !== 3) return false;
      const transactionYear = parseInt(dateParts[0], 10);
      const transactionMonth = parseInt(dateParts[1], 10) - 1;
      return transactionYear === targetYear && transactionMonth === targetMonth;
    });
  }, [allTransactions, displayedDate]);

  const handleAddIncome = async (newTransactionData: Omit<Transaction, "id" | "userId" | "createdAt">) => {
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
      type: 'income' as 'income', 
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
        title: translate({ en: "Income Added", pt: "Receita Adicionada" }),
        description: `${newTransactionData.description} ${translate({ en: "has been successfully added.", pt: "foi adicionada com sucesso." })}`,
      });
      setIsAddFormOpen(false); 
    } catch (error: any) {
      console.error("IncomePage: Error adding income:", error);
      toast({
        title: translate({ en: "Error Adding Income", pt: "Erro ao Adicionar Receita" }),
        description: (error.message || translate({ en: "Could not add income.", pt: "Não foi possível adicionar a receita." })) + (error.code ? ` (Code: ${error.code})` : ''),
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

  const openDeleteConfirmation = (transactionId: string) => {
    const tx = allTransactions.find(t => t.id === transactionId);
    if (tx) {
      setTransactionToDelete(tx);
    }
  };

  const confirmDeleteTransaction = async () => {
    if (!user || !transactionToDelete) {
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: translate({ en: "Transaction not found or user not authenticated.", pt: "Transação não encontrada ou usuário não autenticado." }),
        variant: "destructive",
      });
      setTransactionToDelete(null);
      return;
    }

    try {
      const docRef = doc(db, `users/${user.uid}/transactions`, transactionToDelete.id);
      await deleteDoc(docRef);
      toast({
        title: translate({ en: "Income Deleted", pt: "Receita Excluída" }),
        description: `${transactionToDelete.description} ${translate({en: "has been deleted.", pt: "foi excluída."})}`,
      });
    } catch (error) {
      console.error("IncomePage: Error deleting income:", error);
      toast({
        title: translate({ en: "Error Deleting Income", pt: "Erro ao Excluir Receita" }),
        description: translate({ en: "Could not delete the income.", pt: "Não foi possível excluir a receita." }),
        variant: "destructive",
      });
    } finally {
      setTransactionToDelete(null);
    }
  };


  if (!isClient || authLoading || isLoadingTransactions) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full w-full">
          <p className="text-foreground">{translate({ en: "Loading income...", pt: "Carregando receitas..." })}</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {translate({ en: "Income", pt: "Receitas" })} - {displayedMonthYearLabel}
          </h1>
          <Dialog open={isAddFormOpen} onOpenChange={setIsAddFormOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <PlusCircle className="mr-2 h-4 w-4" />
                {translate({ en: "Add New Income", pt: "Adicionar Nova Receita" })}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{translate({ en: "New Income", pt: "Nova Receita" })}</DialogTitle>
                <DialogDescription>
                  {translate({ en: "Fill in the details for your new income.", pt: "Preencha os detalhes da sua nova receita." })}
                </DialogDescription>
              </DialogHeader>
              <TransactionForm
                onAddTransaction={handleAddIncome}
                initialType="income"
                defaultDate={displayedDate}
                key={displayedDate.toISOString() + "income"} 
              />
            </DialogContent>
          </Dialog>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>{translate({ en: "Income List", pt: "Lista de Receitas" })}</CardTitle>
            <CardDescription>
              {translate({ en: "All your income for", pt: "Todas as suas receitas de" })} {displayedMonthYearLabel}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {incomeForDisplayedPeriod.length > 0 ? (
              <TransactionsTable 
                transactions={incomeForDisplayedPeriod} 
                onEditTransaction={handleEditTransaction}
                onDeleteTransaction={openDeleteConfirmation}
              />
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {translate({ en: "No income recorded for this period.", pt: "Nenhuma receita registrada para este período." })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
       {transactionToDelete && (
        <AlertDialog open={!!transactionToDelete} onOpenChange={(open) => !open && setTransactionToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{translate({en: "Confirm Deletion", pt: "Confirmar Exclusão"})}</AlertDialogTitle>
              <AlertDialogDescription>
                {translate({en: "Are you sure you want to delete the income: ", pt: "Tem certeza que deseja excluir a receita: "})} 
                <strong>{transactionToDelete.description}</strong> ({formatCurrency(transactionToDelete.amount)})? 
                {translate({en: " This action cannot be undone.", pt: " Esta ação não pode ser desfeita."})}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setTransactionToDelete(null)}>{translate({en: "Cancel", pt: "Cancelar"})}</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteTransaction} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {translate({en: "Delete", pt: "Excluir"})}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </AppLayout>
  );
}
