
"use client";
import type { Transaction } from "@/types";
import { SummaryCard } from "./summary-card";
import { BudgetSummaryCard } from "./budget-summary-card"; // New card
import { formatCurrency } from "@/lib/utils";
import { DollarSign, TrendingUp, TrendingDown, ListChecks } from "lucide-react";
import { useLanguage } from "@/context/language-context";

interface SummarySectionProps {
  transactionsThisMonth: Transaction[];
  monthlyBudget: number;
  currentMonthName: string;
}

export function SummarySection({ transactionsThisMonth, monthlyBudget, currentMonthName }: SummarySectionProps) {
  const { translate } = useLanguage();

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
        title={`${translate({ en: "Total Income", pt: "Receita Total" })} ${currentMonthName}`}
        value={formatCurrency(totalIncomeThisMonth)}
        description={translate({ en: "Across all sources", pt: "De todas as fontes" })}
        icon={TrendingUp}
        iconClassName="text-green-500"
      />
      <SummaryCard
        title={`${translate({ en: "Total Spent", pt: "Total Gasto" })} ${currentMonthName}`}
        value={formatCurrency(totalExpensesThisMonth)}
        description={translate({ en: "Across all categories", pt: "Em todas as categorias" })}
        icon={TrendingDown}
        iconClassName="text-red-500"
      />
      <SummaryCard
        title={translate({ en: "Net Cash Flow", pt: "Fluxo de Caixa Líquido" })}
        value={formatCurrency(netCashFlowThisMonth)}
        description={translate({
          en: `Income minus expenses this ${currentMonthName.toLowerCase()}`,
          pt: `Receitas menos despesas neste ${currentMonthName.toLowerCase()}`,
        })}
        icon={DollarSign}
        iconClassName={netCashFlowThisMonth >= 0 ? "text-primary" : "text-destructive"}
      />
      <BudgetSummaryCard
        title={translate({ en: "Budget Status", pt: "Status do Orçamento" })}
        spentAmount={totalExpensesThisMonth}
        totalBudget={monthlyBudget}
        icon={ListChecks}
      />
    </div>
  );
}
