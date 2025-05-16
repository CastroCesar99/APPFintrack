
"use client";
import { useState, useEffect } from "react";
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
import type { Transaction, TransactionType, DisplayCategory, DisplayPaymentMethod } from "@/types"; 
import { useLanguage } from "@/context/language-context";
import Link from "next/link"; 

interface QuickActionsSectionProps {
  onAddTransaction: (transactionData: Omit<Transaction, "id" | "userId" | "createdAt">) => Promise<void>;
  currentDisplayedDate: Date;
  userCategories: DisplayCategory[]; 
  userPaymentMethods: DisplayPaymentMethod[]; 
}

export function QuickActionsSection({ 
  onAddTransaction, 
  currentDisplayedDate,
  userCategories,
  userPaymentMethods 
}: QuickActionsSectionProps) {
  const { translate } = useLanguage();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formInitialType, setFormInitialType] = useState<TransactionType>("expense");
  const [dateForForm, setDateForForm] = useState<Date>(currentDisplayedDate);
  
  console.log("QuickActionsSection TRACER --- Rendering. currentDisplayedDate prop:", currentDisplayedDate.toISOString(), "dateForForm state:", dateForForm.toISOString());

  // Effect to sync dateForForm when currentDisplayedDate changes AND the dialog is NOT open
  // This ensures that if the user navigates months on the dashboard, the next time they open the dialog,
  // it reflects the new dashboard month.
  useEffect(() => {
    console.log("QuickActionsSection TRACER --- useEffect for currentDisplayedDate running. isFormOpen:", isFormOpen, "New currentDisplayedDate:", currentDisplayedDate.toISOString());
    if (!isFormOpen) {
      setDateForForm(currentDisplayedDate);
    }
  }, [currentDisplayedDate, isFormOpen]);

  const handleOpenDialog = (type: TransactionType) => {
    console.log("QuickActionsSection TRACER --- handleOpenDialog. currentDisplayedDate prop:", currentDisplayedDate.toISOString(), "Setting dateForForm.");
    setDateForForm(currentDisplayedDate); // Capture the date when dialog is opened
    setFormInitialType(type);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (transactionData: Omit<Transaction, "id" | "userId" | "createdAt">) => {
    try {
      await onAddTransaction(transactionData);
      setIsFormOpen(false); 
    } catch (error) {
      console.error("Error submitting transaction from QuickActionsSection:", error);
      // Potentially show a toast error here if onAddTransaction doesn't handle it
    }
  };
  
  const quickActionsTitle = translate({ en: "Quick Actions", pt: "Ações Rápidas" });
  const addExpenseLabel = translate({ en: "Add Expense", pt: "Adicionar Despesa" });
  const addIncomeLabel = translate({ en: "Add Income", pt: "Adicionar Receita" });
  const manageBudgetsLabel = translate({ en: "Manage Budgets", pt: "Gerenciar Orçamentos" });
  const newTransactionTitle = translate({ en: "New Transaction", pt: "Nova Transação" });
  const newTransactionDescription = translate({ en: "Fill in the details for your new transaction.", pt: "Preencha os detalhes da sua nova transação." });

  if (isFormOpen) {
    console.log("QuickActionsSection TRACER --- Rendering TransactionForm with defaultDate (dateForForm):", dateForForm.toISOString(), "and key:", dateForForm.toISOString() + formInitialType);
  }

  return (
    <Card className="shadow-md bg-muted/50">
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
            <Link href="/budgets" passHref className="w-full">
              <Button variant="outline" className="w-full">
                <SlidersHorizontal className="mr-2 h-4 w-4" /> {manageBudgetsLabel}
              </Button>
            </Link>
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
                defaultDate={dateForForm} 
                userCategories={userCategories} 
                userPaymentMethods={userPaymentMethods} 
                key={dateForForm.toISOString() + formInitialType} 
              />
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
