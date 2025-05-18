
"use client";
import type React from 'react';
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
  onSave: (transactionData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">, id?:string) => Promise<void>; // Renamed from onAddTransaction
  currentDisplayedDate: Date;
  userCategories: DisplayCategory[];
  userPaymentMethods: DisplayPaymentMethod[];
}

export function QuickActionsSection({ 
  onSave, // Renamed from onAddTransaction
  currentDisplayedDate,
  userCategories,
  userPaymentMethods 
}: QuickActionsSectionProps) {
  const { translate } = useLanguage();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formInitialType, setFormInitialType] = useState<TransactionType>("expense");
  
  const [dateForForm, setDateForForm] = useState<Date>(currentDisplayedDate);

  useEffect(() => {
    if (!isFormOpen) {
      console.log("QuickActionsSection TRACER --- Dialog closed or currentDisplayedDate changed while closed. Syncing dateForForm:", currentDisplayedDate.toISOString());
      setDateForForm(currentDisplayedDate);
    }
  }, [currentDisplayedDate, isFormOpen]);

  const handleOpenDialog = (type: TransactionType) => {
    console.log("QuickActionsSection TRACER --- handleOpenDialog. Type:", type, "currentDisplayedDate prop:", currentDisplayedDate.toISOString());
    setFormInitialType(type);
    setDateForForm(currentDisplayedDate); 
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (transactionData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">) => {
    try {
      await onSave(transactionData); // Using the onSave prop from parent
      setIsFormOpen(false); 
    } catch (error) {
      console.error("Error submitting transaction from QuickActionsSection:", error);
    }
  };
  
  const quickActionsTitle = translate({ en: "Quick Actions", pt: "Ações Rápidas" });
  const addExpenseLabel = translate({ en: "Add Expense", pt: "Adicionar Despesa" });
  const addIncomeLabel = translate({ en: "Add Income", pt: "Adicionar Receita" });
  const manageBudgetsLabel = translate({ en: "Manage Budgets", pt: "Gerenciar Orçamentos" });
  const newTransactionTitle = translate({ en: "New Transaction", pt: "Nova Transação" });
  const newTransactionDescription = translate({ en: "Fill in the details for your new transaction.", pt: "Preencha os detalhes da sua nova transação." });

  // Forcing re-render of TransactionForm when dateForForm changes by using it in the key
  const formKey = dateForForm.toISOString() + formInitialType;
  console.log(`QuickActionsSection TRACER --- Rendering TransactionForm with formInitialType: '${formInitialType}', defaultDate: '${dateForForm.toISOString()}', userCategories length: ${userCategories?.length}, First category type if exists: ${userCategories?.[0]?.type}, Form key: ${formKey}`);
  
  return (
    <Card className="shadow-md bg-muted/50">
      <CardHeader>
        <CardTitle className="text-base font-semibold">{quickActionsTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen} modal={false}> 
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{newTransactionTitle}</DialogTitle>
              <DialogDescription>
                {newTransactionDescription}
              </DialogDescription>
            </DialogHeader>
            {isFormOpen && (
              <TransactionForm
                onSave={handleFormSubmit} // Changed from onAddTransaction to onSave
                initialType={formInitialType}
                defaultDate={dateForForm} 
                userCategories={userCategories} 
                userPaymentMethods={userPaymentMethods} 
                transactionToEdit={null} // Explicitly null for adding
                key={formKey} 
              />
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
