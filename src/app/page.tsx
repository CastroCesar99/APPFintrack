
"use client";
import type React from 'react';
import { useState, useEffect } from "react";
import { useRouter } from 'next/navigation'; // Import useRouter
import { AppLayout } from "@/components/layout/app-layout";
import { SummarySection } from "@/components/dashboard/summary-section";
import { QuickActionsSection } from "@/components/dashboard/quick-actions-section";
import { RecentTransactionsSection } from "@/components/dashboard/recent-transactions-section";
import { ExpenseCategoryChart } from "@/components/dashboard/charts/expense-category-chart";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Transaction } from "@/types";
import { v4 as uuidv4 } from 'uuid';

// Updated initial transactions to better match the screenshot's context (May 2025)
const initialTransactions: Transaction[] = [
  // Income
  { id: uuidv4(), date: '2025-05-08', description: 'Salário Gi', amount: 4100, type: 'income', category: 'Salary' },
  { id: uuidv4(), date: '2025-05-08', description: 'Salary', amount: 2500, type: 'income', category: 'Salary' },
  { id: uuidv4(), date: '2025-05-01', description: 'Freelance Project', amount: 300, type: 'income', category: 'Freelance' },
  { id: uuidv4(), date: '2025-04-08', description: 'Salary', amount: 2400, type: 'income', category: 'Salary' }, // Previous month
  { id: uuidv4(), date: '2025-05-10', description: 'Stock Dividends', amount: 200, type: 'income', category: 'Investment' },

  // Expenses
  { id: uuidv4(), date: '2025-05-08', description: 'Lunch at Cafe', amount: 12.50, type: 'expense', category: 'Dining Out' },
  { id: uuidv4(), date: '2025-05-07', description: 'Weekly groceries', amount: 55.00, type: 'expense', category: 'Groceries' },
  { id: uuidv4(), date: '2025-05-06', description: 'Electricity Bill', amount: 250.00, type: 'expense', category: 'Utilities' },
  { id: uuidv4(), date: '2025-05-08', description: 'Gasoline', amount: 30.00, type: 'expense', category: 'Transport' },
  { id: uuidv4(), date: '2025-05-07', description: 'New T-shirt', amount: 75.00, type: 'expense', category: 'Shopping' },
  { id: uuidv4(), date: '2025-04-15', description: 'Rent Payment', amount: 1500, type: 'expense', category: 'Rent/Mortgage' }, // Previous month
  { id: uuidv4(), date: '2025-05-03', description: 'Movie Tickets', amount: 25.00, type: 'expense', category: 'Entertainment' },
];

// Define a hardcoded budget for "Budget Status" card
const MONTHLY_BUDGET = 900; // This might be superseded by user-defined budgets later

export default function DashboardPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isClient, setIsClient] = useState(false);
  const [currentMonthName, setCurrentMonthName] = useState('');
  const [isLoadingOnboarding, setIsLoadingOnboarding] = useState(true);


  useEffect(() => {
    setIsClient(true);
    const onboardingComplete = localStorage.getItem('onboardingComplete');
    if (!onboardingComplete) {
      router.push('/onboarding');
    } else {
      setIsLoadingOnboarding(false);
      const storedTransactions = localStorage.getItem('fintrack-transactions');
      if (storedTransactions) {
        setTransactions(JSON.parse(storedTransactions));
      } else {
        setTransactions(initialTransactions);
      }
    }
    // For "This Month" labels, using a fixed "May" to match screenshot context
    setCurrentMonthName('May'); 
  }, [router]); // Add router to dependency array
  
  useEffect(() => {
    if(isClient && !isLoadingOnboarding) { // Only save if onboarding is complete
        localStorage.setItem('fintrack-transactions', JSON.stringify(transactions));
    }
  }, [transactions, isClient, isLoadingOnboarding]);

  const MOCK_CURRENT_YEAR = 2025;
  const MOCK_CURRENT_MONTH = 4; // 0-indexed for May

  const transactionsThisMonth = transactions.filter(t => {
    const transactionDate = new Date(t.date);
    return transactionDate.getFullYear() === MOCK_CURRENT_YEAR && transactionDate.getMonth() === MOCK_CURRENT_MONTH;
  });

  const recentIncome = transactions
    .filter(t => t.type === 'income')
    .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const recentExpenses = transactions
    .filter(t => t.type === 'expense')
    .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  if (!isClient || isLoadingOnboarding) {
    // Show a generic loading state or null while checking onboarding status or if not client yet
    return (
        <div className="flex items-center justify-center h-screen bg-background">
          <p className="text-foreground">Loading...</p>
        </div>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-8">
        <SummarySection 
          transactionsThisMonth={transactionsThisMonth} 
          monthlyBudget={MONTHLY_BUDGET}
          currentMonthName={currentMonthName}
        />
        
        <QuickActionsSection />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <RecentTransactionsSection
            title="Recent Income"
            description="Your latest income entries."
            transactions={recentIncome}
            type="income"
          />
          <RecentTransactionsSection
            title="Recent Expenses"
            description="Your last few transactions."
            transactions={recentExpenses}
            type="expense"
          />
        </div>
        
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Spending by Category</CardTitle>
            <CardDescription>Current month's spending distribution.</CardDescription>
          </CardHeader>
          <CardContent>
            {transactionsThisMonth.filter(t => t.type === 'expense').length > 0 ? (
              <ExpenseCategoryChart transactions={transactionsThisMonth} />
            ) : (
              <div className="flex items-center justify-center h-[300px]">
                <p className="text-muted-foreground">No expense data for this month to display chart.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
