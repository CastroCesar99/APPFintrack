
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle, SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
  DialogFooter,
} from "@/components/ui/dialog";
import { TransactionForm } from "./transaction-form"; // Assuming TransactionForm is in the same directory
import type { Transaction, TransactionType } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/context/language-context";
import { useAuth } from "@/context/auth-context";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export function QuickActionsSection() {
  const { translate } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formInitialType, setFormInitialType] = useState<TransactionType>("expense");

  const handleOpenDialog = (type: TransactionType) => {
    setFormInitialType(type);
    setIsFormOpen(true);
  };

  const handleAddTransactionToFirestore = async (transactionData: Omit<Transaction, "id">) => {
    if (!user) {
      toast({
        title: translate({ en: "Authentication Error", pt: "Erro de Autenticação" }),
        description: translate({ en: "You must be logged in to add a transaction.", pt: "Você precisa estar logado para adicionar uma transação." }),
        variant: "destructive",
      });
      return;
    }

    try {
      const transactionWithUserAndTimestamp = {
        ...transactionData,
        userId: user.uid,
        createdAt: serverTimestamp(),
      };
      const transactionsColRef = collection(db, `users/${user.uid}/transactions`);
      await addDoc(transactionsColRef, transactionWithUserAndTimestamp);

      toast({
        title: translate({ en: "Transaction Added", pt: "Transação Adicionada" }),
        description: translate({
          en: `${transactionData.description} for ${transactionData.amount} has been successfully added.`,
          pt: `${transactionData.description} de ${transactionData.amount} foi adicionada com sucesso.`,
        }),
      });
      setIsFormOpen(false); // Close dialog on success
    } catch (error) {
      console.error("Error adding transaction to Firestore:", error);
      toast({
        title: translate({ en: "Error Adding Transaction", pt: "Erro ao Adicionar Transação" }),
        description: translate({
          en: "Could not save the transaction. Please try again.",
          pt: "Não foi possível salvar a transação. Por favor, tente novamente.",
        }),
        variant: "destructive",
      });
    }
  };

  const handleManageBudgets = () => {
    toast({
      title: translate({ en: "Coming Soon!", pt: "Em Breve!" }),
      description: translate({
        en: "Budget management feature is under development.",
        pt: "A funcionalidade de gerenciamento de orçamentos está em desenvolvimento.",
      }),
    });
  };
  
  const quickActionsTitle = translate({ en: "Quick Actions", pt: "Ações Rápidas" });
  const addExpenseLabel = translate({ en: "Add Expense", pt: "Adicionar Despesa" });
  const addIncomeLabel = translate({ en: "Add Income", pt: "Adicionar Receita" });
  const manageBudgetsLabel = translate({ en: "Manage Budgets", pt: "Gerenciar Orçamentos" });
  const newTransactionTitle = translate({ en: "New Transaction", pt: "Nova Transação" });
  const newTransactionDescription = translate({ en: "Fill in the details for your new transaction.", pt: "Preencha os detalhes da sua nova transação." });


  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="text-base font-semibold">{quickActionsTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Button onClick={() => handleOpenDialog("expense")} className="w-full">
              <PlusCircle className="mr-2 h-4 w-4" /> {addExpenseLabel}
            </Button>
            <Button onClick={() => handleOpenDialog("income")} variant="outline" className="w-full">
              <PlusCircle className="mr-2 h-4 w-4" /> {addIncomeLabel}
            </Button>
            <Button onClick={handleManageBudgets} variant="outline" className="w-full">
              <SlidersHorizontal className="mr-2 h-4 w-4" /> {manageBudgetsLabel}
            </Button>
          </div>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{newTransactionTitle}</DialogTitle>
              <DialogDescription>
                {newTransactionDescription}
              </DialogDescription>
            </DialogHeader>
            <TransactionForm 
              onAddTransaction={handleAddTransactionToFirestore} 
              initialType={formInitialType}
            />
            {/* DialogFooter and DialogClose can be part of TransactionForm's submit or handled here */}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
