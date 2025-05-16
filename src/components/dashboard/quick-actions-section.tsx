
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
} from "@/components/ui/dialog";
import { TransactionForm } from "./transaction-form";
import type { Transaction, TransactionType } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/context/language-context";

interface QuickActionsSectionProps {
  onAddTransaction: (transactionData: Omit<Transaction, "id" | "userId" | "createdAt">) => Promise<void>;
  currentDisplayedDate: Date; // New prop for the current displayed date
}

export function QuickActionsSection({ onAddTransaction, currentDisplayedDate }: QuickActionsSectionProps) {
  const { translate } = useLanguage();
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formInitialType, setFormInitialType] = useState<TransactionType>("expense");

  const handleOpenDialog = (type: TransactionType) => {
    setFormInitialType(type);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (transactionData: Omit<Transaction, "id" | "userId" | "createdAt">) => {
    try {
      await onAddTransaction(transactionData);
      setIsFormOpen(false); 
    } catch (error) {
      console.error("Error submitting transaction from QuickActionsSection:", error);
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
            <Button onClick={() => handleOpenDialog("expense")} variant="outline" className="w-full">
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
            {isFormOpen && (
              <TransactionForm
                onAddTransaction={handleFormSubmit} 
                initialType={formInitialType}
                defaultDate={currentDisplayedDate} // Pass the current displayed date
              />
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

    