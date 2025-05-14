"use client";
import type { Transaction } from "@/types";
import { SummaryCard } from "./summary-card";
import { formatCurrency } from "@/lib/utils";
import { DollarSign, TrendingUp, TrendingDown } from "lucide-react"; // More specific icons

interface SummarySectionProps {
  transactions: Transaction[];
}

export function SummarySection({ transactions }: SummarySectionProps) {
  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const balance = totalIncome - totalExpenses;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <SummaryCard
        title="Total Income"
        value={formatCurrency(totalIncome)}
        icon={TrendingUp}
        iconClassName="text-green-500"
      />
      <SummaryCard
        title="Total Expenses"
        value={formatCurrency(totalExpenses)}
        icon={TrendingDown}
        iconClassName="text-red-500"
      />
      <SummaryCard
        title="Balance"
        value={formatCurrency(balance)}
        icon={DollarSign}
        iconClassName={balance >= 0 ? "text-primary" : "text-destructive"}
      />
    </div>
  );
}
