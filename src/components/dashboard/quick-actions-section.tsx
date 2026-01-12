
"use client";
import type React from 'react';
import { useState, useEffect } from "react";
import { useRouter } from 'next/navigation';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TransactionForm } from "./transaction-form"; 
import type { Transaction, TransactionType, DisplayCategory, DisplayPaymentMethod } from "@/types"; 
import { useLanguage } from "@/context/language-context";
import Link from "next/link"; 

interface QuickActionsSectionProps {
  onSave: (transactionData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">, id?:string) => Promise<void>;
  currentDisplayedDate: Date;
  userCategories: DisplayCategory[];
  userPaymentMethods: DisplayPaymentMethod[];
  isSubscriptionActive: boolean;
}

export function QuickActionsSection({ 
  onSave,
  currentDisplayedDate,
  userCategories,
  userPaymentMethods,
  isSubscriptionActive,
}: QuickActionsSectionProps) {
  const { translate } = useLanguage();
  const router = useRouter();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showSubscriptionAlert, setShowSubscriptionAlert] = useState(false);
  const [formInitialType, setFormInitialType] = useState<TransactionType>("expense");
  const [dateForForm, setDateForForm] = useState<Date>(currentDisplayedDate);
  // Add a counter to force re-render
  const [formRenderKey, setFormRenderKey] = useState(0);

  useEffect(() => {
    if (!isFormOpen) {
      setDateForForm(currentDisplayedDate);
    }
  }, [currentDisplayedDate, isFormOpen]);

  const handleOpenDialog = (type: TransactionType) => {
    if (!isSubscriptionActive) {
      setShowSubscriptionAlert(true);
      return;
    }
    setFormInitialType(type);
    setDateForForm(currentDisplayedDate);
    // Increment key to force complete re-mount of the form component
    setFormRenderKey(prev => prev + 1);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (transactionData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">) => {
    try {
      await onSave(transactionData);
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
                key={formRenderKey} // Unique key forces re-mount every time dialog opens
                onSave={handleFormSubmit}
                initialType={formInitialType}
                defaultDate={dateForForm} 
                userCategories={userCategories} 
                userPaymentMethods={userPaymentMethods} 
                transactionToEdit={null}
              />
            )}
          </DialogContent>
        </Dialog>
        <AlertDialog open={showSubscriptionAlert} onOpenChange={setShowSubscriptionAlert}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{translate({ en: "Subscription Required", pt: "Assinatura Necessária" })}</AlertDialogTitle>
              <AlertDialogDescription>
                {translate({ en: "You need an active subscription to add new transactions. Please renew your subscription to continue.", pt: "Você precisa de uma assinatura ativa para adicionar novas transações. Por favor, renove sua assinatura para continuar." })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{translate({ en: "Cancel", pt: "Cancelar" })}</AlertDialogCancel>
              <AlertDialogAction onClick={() => router.push('/subscription')}>
                {translate({ en: "Go to Subscription", pt: "Ir para Assinatura" })}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
