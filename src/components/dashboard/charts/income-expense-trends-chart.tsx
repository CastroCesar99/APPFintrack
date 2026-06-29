"use client";
import type { Transaction } from "@/types";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { ChartConfig, ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { format, parseISO, startOfMonth, getMonth, getYear } from "date-fns";
import { useMemo } from "react";
import { formatCurrency } from "@/lib/utils";

interface IncomeExpenseTrendsChartProps {
  transactions: Transaction[];
}

const chartConfig = {
  income: {
    label: "Income",
    color: "hsl(var(--chart-2))", // Navy Blue (accent)
  },
  expenses: {
    label: "Expenses",
    color: "hsl(var(--chart-1))", // Dark Purple (primary)
  },
} satisfies ChartConfig;


export function IncomeExpenseTrendsChart({ transactions }: IncomeExpenseTrendsChartProps) {
  const monthlyData = useMemo(() => {
    const dataByMonth: Record<string, { month: string; income: number; expenses: number }> = {};

    transactions.forEach((t) => {
      const date = parseISO(t.date);
      const monthKey = format(startOfMonth(date), "yyyy-MM"); // e.g., "2024-01"
      
      if (!dataByMonth[monthKey]) {
        dataByMonth[monthKey] = {
          month: format(startOfMonth(date), "MMM yy"), // e.g., "Jan 24"
          income: 0,
          expenses: 0,
        };
      }

      if (t.type === "income") {
        dataByMonth[monthKey].income += t.amount;
      } else {
        dataByMonth[monthKey].expenses += t.amount;
      }
    });
    
    return Object.values(dataByMonth).sort((a,b) => {
        const [aMonth, aYear] = a.month.split(" ");
        const [bMonth, bYear] = b.month.split(" ");
        const aDate = new Date(`${aMonth} 1, 20${aYear}`);
        const bDate = new Date(`${bMonth} 1, 20${bYear}`);
        return aDate.getTime() - bDate.getTime();
    });
  }, [transactions]);

  if (monthlyData.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No transaction data for trends chart.</p>;
  }

  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={monthlyData} margin={{ top: 5, right: 0, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
          <YAxis tickFormatter={(value) => formatCurrency(value, 'USD').replace('.00','')} tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
          <Tooltip
            cursor={true}
            content={<ChartTooltipContent 
                formatter={(value, name) => `${chartConfig[name as keyof typeof chartConfig].label}: ${formatCurrency(value as number)}`} 
            />}
          />
          <Legend />
          <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
