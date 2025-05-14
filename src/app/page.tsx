"use client";
import type React from 'react';
import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { SummarySection } from "@/components/dashboard/summary-section";
import { TransactionForm } from "@/components/dashboard/transaction-form";
import { TransactionsTable } from "@/components/dashboard/transactions-table";
import { ExpenseCategoryChart } from "@/components/dashboard/charts/expense-category-chart";
import { IncomeExpenseTrendsChart } from "@/components/dashboard/charts/income-expense-trends-chart";
import { ExportData } from "@/components/dashboard/export-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Transaction, TransactionType, CategoryName } from "@/types";
import { Separator } from '@/components/ui/separator';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

// Helper to generate unique IDs if 'uuid' is not available or preferred
// const generateId = () => Math.random().toString(36).substr(2, 9);
// Using uuid is more robust

const initialTransactions: Transaction[] = [
  { id: uuidv4(), date: '2024-07-01', description: 'Monthly Salary', amount: 5000, type: 'income', category: 'Salary' },
  { id: uuidv4(), date: '2024-07-01', description: 'Rent Payment', amount: 1500, type: 'expense', category: 'Rent/Mortgage' },
  { id: uuidv4(), date: '2024-07-03', description: 'Groceries Shopping', amount: 120.50, type: 'expense', category: 'Groceries' },
  { id: uuidv4(), date: '2024-07-05', description: 'Freelance Project A', amount: 750, type: 'income', category: 'Freelance' },
  { id: uuidv4(), date: '2024-07-05', description: 'Dinner with Friends', amount: 65.00, type: 'expense', category: 'Dining Out' },
  { id: uuidv4(), date: '2024-06-10', description: 'Electricity Bill', amount: 75.20, type: 'expense', category: 'Utilities' },
  { id: uuidv4(), date: '2024-06-15', description: 'Stock Dividends', amount: 200, type: 'income', category: 'Investment' },
  { id: uuidv4(), date: '2024-06-20', description: 'Movie Tickets', amount: 30.00, type: 'expense', category: 'Entertainment' },
];


export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    // Load transactions from local storage or use initial if none
    const storedTransactions = localStorage.getItem('fintrack-transactions');
    if (storedTransactions) {
      setTransactions(JSON.parse(storedTransactions));
    } else {
      setTransactions(initialTransactions);
    }
  }, []);
  
  useEffect(() => {
    if(isClient) { // Only run on client after mount
        localStorage.setItem('fintrack-transactions', JSON.stringify(transactions));
    }
  }, [transactions, isClient]);


  const addTransaction = (newTransactionData: Omit<Transaction, "id">) => {
    const newTransaction: Transaction = {
      id: uuidv4(),
      ...newTransactionData,
    };
    setTransactions((prevTransactions) => [newTransaction, ...prevTransactions]);
  };

  if (!isClient) {
    // Render a loading state or null during SSR/SSG to avoid hydration mismatch from localStorage
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <p>Loading dashboard...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <SummarySection transactions={transactions} />
        
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column: Transaction Form and Expense Breakdown */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Add Transaction</CardTitle>
                <CardDescription>Log your income or expenses.</CardDescription>
              </CardHeader>
              <CardContent>
                <TransactionForm onAddTransaction={addTransaction} />
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Expense Breakdown</CardTitle>
                <CardDescription>See where your money goes.</CardDescription>
              </CardHeader>
              <CardContent>
                <ExpenseCategoryChart transactions={transactions} />
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Trends Chart and Recent Transactions */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Income & Expense Trends</CardTitle>
                <CardDescription>Visualize your financial flow over time.</CardDescription>
              </CardHeader>
              <CardContent>
                <IncomeExpenseTrendsChart transactions={transactions} />
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Recent Transactions</CardTitle>
                    <CardDescription>Your latest financial activities.</CardDescription>
                </div>
                <ExportData transactions={transactions} />
              </CardHeader>
              <CardContent>
                <TransactionsTable transactions={transactions} /> 
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
