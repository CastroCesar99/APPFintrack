
"use client";
import type { Transaction, CategoryName, DisplayCategory } from "@/types"; // Added DisplayCategory
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
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
import { getCategoryDisplayLabel } from "@/types"; // Changed to getCategoryDisplayLabel
import { formatCurrency } from "@/lib/utils";
import { CATEGORIES } from "@/types"; // Import CATEGORIES to find details

interface ExpenseCategoryBarChartProps {
  transactions: Transaction[];
}

const chartColors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  // Removed: "hsl(var(--destructive))",
  // Removed: "hsl(var(--secondary))", 
];

export function ExpenseCategoryBarChart({ transactions }: ExpenseCategoryBarChartProps) {
  const { language, translate } = useLanguage();

  const expenseData = useMemo(() => {
    const expensesByCategory = transactions
      .filter((t) => t.type === "expense")
      .reduce((acc, t) => {
        const categoryKey = t.category as string; // Treat category as string key
        acc[categoryKey] = (acc[categoryKey] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>);

    // Find category details for display name and icon
     return Object.entries(expensesByCategory)
      .map(([name, value]) => {
        const categoryDetail = CATEGORIES.find(cat => cat.name === name) as DisplayCategory | undefined;
        return {
          name: name, // Keep original name for keying in chartConfig
          value,
          displayName: categoryDetail ? getCategoryDisplayLabel(categoryDetail, language) : name,
        };
      })
      .sort((a, b) => b.value - a.value); 
  }, [transactions, language]);

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
      <ResponsiveContainer width="100%" height={Math.max(300, expenseData.length * 40)}> {/* Dynamic height */}
        <BarChart
          data={expenseData}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis type="number" tickFormatter={(value) => formatCurrency(value).replace(/\.\d{2}$/, '')}  fontSize={12} />
          <YAxis
            dataKey="displayName" // Use displayName for Y-axis ticks
            type="category"
            tickLine={false}
            axisLine={false}
            stroke="hsl(var(--foreground))"
            fontSize={12}
            tickMargin={8}
            width={120} 
            interval={0} 
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            content={
              <ChartTooltipContent
                formatter={(value, name, item) => {
                    // item.payload.name is the original key
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
