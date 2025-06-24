
"use client";
import type { Transaction, DisplayCategory } from "@/types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell
} from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { useMemo } from "react";
import { useLanguage } from "@/context/language-context";
import { getCategoryDisplayLabel } from "@/types";
import { formatCurrency } from "@/lib/utils";

interface ExpenseCategoryBarChartProps {
  transactions: Transaction[];
  userCategories: DisplayCategory[];
}

const chartColors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--primary))",
  "hsl(var(--accent))",
];

export function ExpenseCategoryBarChart({ transactions, userCategories }: ExpenseCategoryBarChartProps) {
  const { language, translate } = useLanguage();

  const expenseData = useMemo(() => {
    const expensesByCategory = transactions
      .filter((t) => t.type === "expense")
      .reduce((acc, t) => {
        const categoryInternalName = t.category as string; 
        acc[categoryInternalName] = (acc[categoryInternalName] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>);

     return Object.entries(expensesByCategory)
      .map(([internalName, value]) => {
        const categoryDetail = userCategories.find(cat => cat.name.toLowerCase() === internalName.toLowerCase());
        return {
          name: internalName, 
          value,
          displayName: categoryDetail ? getCategoryDisplayLabel(categoryDetail, language) : internalName,
        };
      })
      .sort((a, b) => b.value - a.value); 
  }, [transactions, userCategories, language]);

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    expenseData.forEach((item, index) => {
      config[item.name] = { 
        label: item.displayName, 
        color: chartColors[index % chartColors.length],
      };
    });
    return config;
  }, [expenseData]);

  if (expenseData.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        {translate({
          en: "No expense data to display.",
          pt: "Sem dados de despesa para exibir.",
        })}
      </p>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <ResponsiveContainer width="100%" height={Math.max(300, expenseData.length * 40)}>
        <BarChart
          data={expenseData}
          layout="vertical"
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis type="number" tickFormatter={(value) => formatCurrency(value).replace(/\.\d{2}$/, '')}  fontSize={12} />
          <YAxis
            dataKey="displayName"
            type="category"
            tickLine={false}
            axisLine={false}
            stroke="hsl(var(--foreground))"
            fontSize={12}
            tickMargin={5}
            width={80} 
            interval={0} 
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            content={
              <ChartTooltipContent
                formatter={(value, name, item) => {
                    // Ensure item.payload.name is treated as string for config lookup
                    const configEntry = chartConfig[item.payload.name as string];
                    return `${configEntry?.label || item.payload.name}: ${formatCurrency(value as number)}`;
                }}
                labelClassName="text-sm font-semibold"
                indicator="dot"
              />
            }
          />
          <Bar dataKey="value" layout="vertical" radius={[0, 4, 4, 0]}>
            {expenseData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={chartConfig[entry.name as string]?.color || chartColors[index % chartColors.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

    