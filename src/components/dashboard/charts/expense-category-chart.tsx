"use client";
import type { Transaction } from "@/types";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ChartConfig, ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { useMemo } from "react";

interface ExpenseCategoryChartProps {
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
];

export function ExpenseCategoryChart({ transactions }: ExpenseCategoryChartProps) {
  const expenseData = useMemo(() => {
    const expensesByCategory = transactions
      .filter((t) => t.type === "expense")
      .reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>);

    return Object.entries(expensesByCategory).map(([name, value]) => ({
      name,
      value,
    })).sort((a,b) => b.value - a.value); // Sort for consistent coloring if categories change
  }, [transactions]);

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    expenseData.forEach((item, index) => {
      config[item.name] = {
        label: item.name,
        color: chartColors[index % chartColors.length],
      };
    });
    return config;
  }, [expenseData]);

  if (expenseData.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No expense data to display.</p>;
  }

  return (
    <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            cursor={false}
            content={<ChartTooltipContent hideLabel />}
          />
          <Pie
            data={expenseData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={100}
            labelLine={false}
            label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name }) => {
              const RADIAN = Math.PI / 180;
              const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
              const x = cx + radius * Math.cos(-midAngle * RADIAN);
              const y = cy + radius * Math.sin(-midAngle * RADIAN);
              // Only show label if percentage is significant
              if ((percent as number) * 100 > 5) {
                 return (
                    <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="12px">
                      {`${name} (${((percent as number) * 100).toFixed(0)}%)`}
                    </text>
                  );
              }
              return null;
            }}
          >
            {expenseData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
            ))}
          </Pie>
           <Legend wrapperStyle={{fontSize: '12px'}}/>
        </PieChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
