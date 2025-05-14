
"use client";
import type { Transaction } from "@/types";
import { SummaryCard } from "./summary-card";
import { BudgetSummaryCard } from "./budget-summary-card"; // New card
import { formatCurrency } from "@/lib/utils";
import { DollarSign, TrendingUp, TrendingDown, ListChecks } from "lucide-react";

interface SummarySectionProps {
  transactionsThisMonth: Transaction[];
  monthlyBudget: number;
  currentMonthName: string;
}

export function SummarySection({ transactionsThisMonth, monthlyBudget, currentMonthName }: SummarySectionProps) {
  const totalIncomeThisMonth = transactionsThisMonth
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpensesThisMonth = transactionsThisMonth
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const netCashFlowThisMonth = totalIncomeThisMonth - totalExpensesThisMonth;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <SummaryCard
        title={`Total Income ${currentMonthName}`}
        value={formatCurrency(totalIncomeThisMonth)}
        description="Across all sources"
        icon={TrendingUp}
        iconClassName="text-green-500"
      />
      <SummaryCard
        title={`Total Spent ${currentMonthName}`}
        value={formatCurrency(totalExpensesThisMonth)}
        description="Across all categories"
        icon={TrendingDown}
        iconClassName="text-red-500"
      />
      <SummaryCard
        title="Net Cash Flow"
        value={formatCurrency(netCashFlowThisMonth)}
        description={`Income minus expenses this ${currentMonthName.toLowerCase()}`}
        icon={DollarSign}
        iconClassName={netCashFlowThisMonth >= 0 ? "text-primary" : "text-destructive"}
      />
      <BudgetSummaryCard
        title="Budget Status"
        spentAmount={totalExpensesThisMonth}
        totalBudget={monthlyBudget}
        icon={ListChecks}
      />
    </div>
  );
}

    