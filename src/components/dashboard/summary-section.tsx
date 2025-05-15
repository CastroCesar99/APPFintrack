
"use client";
import type { Transaction } from "@/types";
import { SummaryCard } from "./summary-card";
import { BudgetSummaryCard } from "./budget-summary-card";
import { formatCurrency } from "@/lib/utils";
import { DollarSign, TrendingUp, TrendingDown, ListChecks } from "lucide-react";
import { useLanguage } from "@/context/language-context";

interface SummarySectionProps {
  transactionsForDisplayedPeriod: Transaction[];
  monthlyBudget: number;
  displayedMonthYearLabel: string; // Renamed from currentMonthName
}

export function SummarySection({ transactionsForDisplayedPeriod, monthlyBudget, displayedMonthYearLabel }: SummarySectionProps) {
  const { translate } = useLanguage();

  const totalIncomeThisPeriod = transactionsForDisplayedPeriod
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpensesThisPeriod = transactionsForDisplayedPeriod
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const netCashFlowThisPeriod = totalIncomeThisPeriod - totalExpensesThisPeriod;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <SummaryCard
        title={`${translate({ en: "Total Income", pt: "Receita Total" })}`}
        value={formatCurrency(totalIncomeThisPeriod)}
        description={displayedMonthYearLabel} // Use displayedMonthYearLabel
        icon={TrendingUp}
        iconClassName="text-green-500"
      />
      <SummaryCard
        title={`${translate({ en: "Total Spent", pt: "Total Gasto" })}`}
        value={formatCurrency(totalExpensesThisPeriod)}
        description={displayedMonthYearLabel} // Use displayedMonthYearLabel
        icon={TrendingDown}
        iconClassName="text-red-500"
      />
      <SummaryCard
        title={translate({ en: "Net Cash Flow", pt: "Fluxo de Caixa Líquido" })}
        value={formatCurrency(netCashFlowThisPeriod)}
        description={translate({
          en: `For ${displayedMonthYearLabel}`, // Use displayedMonthYearLabel
          pt: `Para ${displayedMonthYearLabel}`, // Use displayedMonthYearLabel
        })}
        icon={DollarSign}
        iconClassName={netCashFlowThisPeriod >= 0 ? "text-primary" : "text-destructive"}
      />
      <BudgetSummaryCard
        title={translate({ en: "Monthly Budget Status", pt: "Status do Orçamento Mensal" })}
        spentAmount={totalExpensesThisPeriod}
        totalBudget={monthlyBudget}
        icon={ListChecks}
        description={displayedMonthYearLabel} // Display the month/year here for context
      />
    </div>
  );
}
