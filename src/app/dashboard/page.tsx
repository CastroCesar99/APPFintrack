
"use client";
import type React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useUser } from "@/context/user-context";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { addTransaction, updateUserPreferences, getTransactions } from "@/lib/firebase/firestore";
import type { Transaction, Category, PaymentMethod } from "@/types";

import { DateSelector } from "@/components/dashboard/date-selector";
import { MonthlySummary } from "@/components/dashboard/monthly-summary";
import { QuickActionsSection } from "@/components/dashboard/quick-actions-section";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import { CategoryPieChart } from "@/components/dashboard/category-pie-chart";

export default function DashboardPage() {
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const { 
    userCategories, 
    userPaymentMethods, 
    isSubscriptionActive, 
    loading: preferencesLoading 
  } = useUserPreferences(user?.uid);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);

  useEffect(() => {
    if (user?.uid) {
      setLoadingTransactions(true);
      const monthStr = format(currentDate, 'yyyy-MM');
      getTransactions(user.uid, monthStr)
        .then(setTransactions)
        .catch(console.error)
        .finally(() => setLoadingTransactions(false));
    }
  }, [user?.uid, currentDate]);

  const handleSaveTransaction = async (transactionData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">, id?: string) => {
    if (!user) throw new Error("User not authenticated");
    try {
      await addTransaction(user.uid, transactionData, id);
      // Re-fetch transactions for the current month
      const monthStr = format(currentDate, 'yyyy-MM');
      const updatedTransactions = await getTransactions(user.uid, monthStr);
      setTransactions(updatedTransactions);
      
      // This is the crucial part: Force a hard refresh of the page to ensure all components get fresh data.
      // This is a simple way to ensure all states depending on DB data are refreshed.
      router.refresh();

    } catch (error) {
      console.error("Error saving transaction:", error);
      // Optionally, show an error message to the user
    }
  };

  const handleDateChange = (date: Date) => {
    setCurrentDate(date);
  };

  const isLoading = userLoading || preferencesLoading;

  if (isLoading) {
    return <div>Loading...</div>; // Or a more sophisticated loading skeleton
  }

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-800 dark:text-white mb-4 md:mb-0">
          Dashboard
        </h1>
        <DateSelector onDateChange={handleDateChange} currentDate={currentDate} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="md:col-span-3">
          <QuickActionsSection 
            onSave={handleSaveTransaction}
            currentDisplayedDate={currentDate}
            userCategories={userCategories}
            userPaymentMethods={userPaymentMethods}
            isSubscriptionActive={isSubscriptionActive}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
        <div className="lg:col-span-3">
          <RecentTransactions 
             transactions={transactions} 
             onSave={handleSaveTransaction}
             userCategories={userCategories} 
             userPaymentMethods={userPaymentMethods}
             loading={loadingTransactions}
          />
        </div>
        <div className="lg:col-span-2">
          <CategoryPieChart 
            transactions={transactions} 
            userCategories={userCategories} 
          />
        </div>
      </div>

       <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
          <div className="md:col-span-1">
              <MonthlySummary 
                transactions={transactions} 
                userCategories={userCategories}
              />
          </div>
      </div>
    </div>
  );
}
