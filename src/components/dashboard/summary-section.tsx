
"use client";
import type { Transaction } from "@/types";
import { SummaryCard } from "./summary-card";
import { BudgetSummaryCard } from "./budget-summary-card";
import { formatCurrency } from "@/lib/utils";
import { DollarSign, TrendingUp, TrendingDown, ListChecks } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import { useMemo } from 'react';

interface SummarySectionProps {
  transactionsForDisplayedPeriod: Transaction[];
  monthlyBudget: number;
  displayedMonthYearLabel: string;
}

export function SummarySection({ 
  transactionsForDisplayedPeriod = [], // Added default value here
  monthlyBudget, 
  displayedMonthYearLabel 
}: SummarySectionProps) {
  const { translate } = useLanguage();
  console.log("SummarySection: TRACER --- Received props: displayedMonthYearLabel:", displayedMonthYearLabel, "transactionsForDisplayedPeriod.length:", transactionsForDisplayedPeriod.length);

  const totalIncomeThisPeriod = useMemo(() => {
    return transactionsForDisplayedPeriod
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactionsForDisplayedPeriod]);

  const totalExpensesThisPeriod = useMemo(() => {
    return transactionsForDisplayedPeriod
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactionsForDisplayedPeriod]);

  const netCashFlowThisPeriod = totalIncomeThisPeriod - totalExpensesThisPeriod;
  console.log("SummarySection: TRACER --- Calculated totals: totalIncomeThisPeriod:", totalIncomeThisPeriod, "totalExpensesThisPeriod:", totalExpensesThisPeriod);


  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <SummaryCard
        title={`${translate({ en: "Total Income", pt: "Receita Total" })}`}
        value={formatCurrency(totalIncomeThisPeriod)}
        description={displayedMonthYearLabel}
        icon={TrendingUp}
        iconClassName="text-green-500"
      />
      <SummaryCard
        title={`${translate({ en: "Total Spent", pt: "Total Gasto" })}`}
        value={formatCurrency(totalExpensesThisPeriod)}
        description={displayedMonthYearLabel}
        icon={TrendingDown}
        iconClassName="text-red-500"
      />
      <SummaryCard
        title={translate({ en: "Net Cash Flow", pt: "Fluxo de Caixa Líquido" })}
        value={formatCurrency(netCashFlowThisPeriod)}
        description={translate({
          en: `For ${displayedMonthYearLabel}`,
          pt: `Para ${displayedMonthYearLabel}`,
        })}
        icon={DollarSign}
        iconClassName={netCashFlowThisPeriod >= 0 ? "text-primary" : "text-destructive"}
      />
      <BudgetSummaryCard
        title={translate({ en: "Monthly Budget Status", pt: "Status do Orçamento Mensal" })}
        spentAmount={totalExpensesThisPeriod}
        totalBudget={monthlyBudget}
        icon={ListChecks}
        description={displayedMonthYearLabel}
      />
    </div>
  );
}
