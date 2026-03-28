
"use client";

import type React from 'react';
import { useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Transaction, DisplayCategory } from "@/types";
import { useLanguage } from "@/context/language-context";
import { getCategoryDisplayLabel } from "@/types";

interface ExpenseCategoryChartProps {
  transactions: Transaction[];
  allUserCategories: DisplayCategory[];
}

export function ExpenseCategoryChart({ transactions, allUserCategories }: ExpenseCategoryChartProps) {
  const { translate, language } = useLanguage();

  const expenseTransactions = useMemo(() => 
    transactions.filter(t => t.type === 'expense'), 
    [transactions]
  );

  const categoryMap = useMemo(() => {
    const map = new Map<string, DisplayCategory>();
    allUserCategories.forEach(cat => map.set(cat.name, cat));
    return map;
  }, [allUserCategories]);

  const aggregatedData = useMemo(() => {
    const categoryTotals: { [key: string]: number } = {};

    expenseTransactions.forEach(transaction => {
      const categoryName = transaction.category || 'Other Expense';
      categoryTotals[categoryName] = (categoryTotals[categoryName] || 0) + transaction.amount;
    });

    return Object.entries(categoryTotals)
      .map(([name, total]) => ({
        name,
        total,
        label: getCategoryDisplayLabel(categoryMap.get(name), language),
      }))
      .sort((a, b) => b.total - a.total);
      
  }, [expenseTransactions, language, categoryMap]);

  const chartData = aggregatedData.slice(0, 10);

  const chartTitle = translate({ en: "Expense by Category", pt: "Despesas por Categoria" });
  const chartDescription = translate({ en: "Breakdown of your spending by category for the selected period.", pt: "Detalhamento dos seus gastos por categoria para o período selecionado." });
  const noDataMessage = translate({ en: "No expense data available for this period to display the chart.", pt: "Não há dados de despesas disponíveis para este período para exibir o gráfico." });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="rounded-lg border bg-background p-2 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col">
              <span className="text-[0.70rem] uppercase text-muted-foreground">
                {translate({ en: 'Category', pt: 'Categoria' })}
              </span>
              <span className="font-bold text-muted-foreground">
                {data.label} 
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[0.70rem] uppercase text-muted-foreground">
                {translate({ en: 'Amount', pt: 'Valor' })}
              </span>
              <span className="font-bold">
                 {new Intl.NumberFormat(language === 'pt' ? 'pt-BR' : 'en-US', { style: 'currency', currency: language === 'pt' ? 'BRL' : 'USD' }).format(data.total)}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="shadow-md bg-muted/50">
      <CardHeader>
        <CardTitle className="text-base font-semibold">{chartTitle}</CardTitle>
        <CardDescription>{chartDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartData}>
              <XAxis
                dataKey="label" 
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => value.length > 15 ? `${value.substring(0, 12)}...` : value}
              />
              <YAxis
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${value / 1000}k`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
              <Legend />
              <Bar dataKey="total" fill="var(--color-expense)" radius={[4, 4, 0, 0]} name={translate({ en: 'Total Spent', pt: 'Total Gasto'})} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[350px] w-full items-center justify-center">
            <p className="text-muted-foreground">{noDataMessage}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
