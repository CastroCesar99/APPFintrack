
"use client";
import type { Transaction, CategoryName } from "@/types";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ChartConfig, ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { useMemo } from "react";
import { useLanguage } from "@/context/language-context";
import { getCategoryLabel } from "@/types"; // CATEGORIES import removed as getCategoryLabel is sufficient here

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
  const { language, translate } = useLanguage(); // Added translate for the "no data" message

  const expenseData = useMemo(() => {
    const expensesByCategory = transactions
      .filter((t) => t.type === "expense")
      .reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {} as Record<CategoryName, number>);

    return Object.entries(expensesByCategory).map(([name, value]) => ({
      name: name as CategoryName,
      value,
      displayName: getCategoryLabel(name as CategoryName, language),
    })).sort((a,b) => b.value - a.value);
  }, [transactions, language]);

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    expenseData.forEach((item, index) => {
      config[item.name] = { // item.name is the English CategoryName, used as the key
        label: item.displayName, // item.displayName is the translated label
        color: chartColors[index % chartColors.length],
      };
    });
    return config;
  }, [expenseData]);

  if (expenseData.length === 0) {
    return <p className="text-center text-muted-foreground py-8">
      {translate({ en: "No expense data to display.", pt: "Sem dados de despesa para exibir." })}
    </p>;
  }

  return (
    <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            cursor={false}
            content={<ChartTooltipContent
                formatter={(value, name, item) => { // item is the tooltip payload
                    // item.payload refers to the original data object from expenseData
                    // item.payload.displayName should have the translated label
                    return [`${item.payload.displayName}: ${value.toLocaleString()}`];
                }}
                hideLabel
            />}
          />
          <Pie
            data={expenseData}
            dataKey="value"
            nameKey="displayName" // Use displayName for internal recharts naming if needed by other props
            cx="50%"
            cy="50%"
            outerRadius={100}
            labelLine={false}
            label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, ...rest }) => {
              // Access displayName from the rest object, which corresponds to the current slice's data.
              // The 'name' prop in the args might be the original English name or display name based on nameKey.
              // To be safe, use the `displayName` from the full slice data if available in `rest`.
              // Recharts passes the full data entry for the slice as part of the props to label.
              const currentSliceData = rest as typeof expenseData[number];
              const labelDisplayName = currentSliceData.displayName;

              const RADIAN = Math.PI / 180;
              const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
              const x = cx + radius * Math.cos(-midAngle * RADIAN);
              const y = cy + radius * Math.sin(-midAngle * RADIAN);

              if ((percent as number) * 100 > 5) {
                 return (
                    <text x={x} y={y} fill="hsl(var(--card-foreground))" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="12px">
                      {`${labelDisplayName} (${((percent as number) * 100).toFixed(0)}%)`}
                    </text>
                  );
              }
              return null;
            }}
          >
            {expenseData.map((entry, i) => ( // Renamed index to i to avoid conflict with Pie label prop
              <Cell key={`cell-${i}`} fill={chartColors[i % chartColors.length]} />
            ))}
          </Pie>
           <Legend
                wrapperStyle={{fontSize: '12px'}}
                formatter={(value, entry) => {
                    // `value` is the nameKey (displayName). `entry.payload.name` is the original English key.
                    return chartConfig[entry.payload.name as CategoryName]?.label || value;
                }}
            />
        </PieChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
