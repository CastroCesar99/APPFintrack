
"use client";
import type { Transaction, CategoryName } from "@/types";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ChartConfig, ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { useMemo } from "react";
import { useLanguage } from "@/context/language-context";
import { getCategoryLabel } from "@/types"; 

interface ExpenseCategoryChartProps {
  transactions: Transaction[];
}

const chartColors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--primary))", // Ensure primary can be used
  "hsl(var(--accent))",  // Ensure accent can be used
  // Add more distinct theme-based colors if needed
  "hsl(var(--destructive))",
  "hsl(var(--secondary))",
];

export function ExpenseCategoryChart({ transactions }: ExpenseCategoryChartProps) {
  const { language, translate } = useLanguage(); 

  const expenseData = useMemo(() => {
    const expensesByCategory = transactions
      .filter((t) => t.type === "expense")
      .reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {} as Record<CategoryName | string, number>); // Allow string for custom categories

    return Object.entries(expensesByCategory).map(([name, value]) => ({
      name: name as CategoryName | string, // Keep original name for keying in chartConfig
      value,
      displayName: getCategoryLabel(name as CategoryName | string, language), // Use translated name for display
    })).sort((a,b) => b.value - a.value);
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
    return <p className="text-center text-muted-foreground py-8">
      {translate({ en: "No expense data to display.", pt: "Sem dados de despesa para exibir." })}
    </p>;
  }

  return (
    <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[300px] sm:max-h-[350px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            cursor={false}
            content={<ChartTooltipContent
                formatter={(value, name, item) => { 
                    // item.payload.displayName should have the translated label
                    return [`${item.payload.displayName}: ${value.toLocaleString()}`];
                }}
                hideLabel
            />}
          />
          <Pie
            data={expenseData}
            dataKey="value"
            nameKey="displayName" 
            cx="50%"
            cy="50%"
            outerRadius={80} // Adjusted for potentially better fit with side legend
            innerRadius={45} // Made donut thicker
            labelLine={false}
            label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, ...rest }) => {
              const currentSliceData = rest as typeof expenseData[number];
              const labelDisplayName = currentSliceData.displayName;

              const RADIAN = Math.PI / 180;
              // Position labels further inside the thicker slices
              const radius = innerRadius + (outerRadius - innerRadius) * 0.6; 
              const x = cx + radius * Math.cos(-midAngle * RADIAN);
              const y = cy + radius * Math.sin(-midAngle * RADIAN);

              if ((percent as number) * 100 > 4) { // Show label for slices > 4%
                 return (
                    <text x={x} y={y} fill="hsl(var(--primary-foreground))" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize="11px" fontWeight="medium">
                      {`${labelDisplayName} (${((percent as number) * 100).toFixed(0)}%)`}
                    </text>
                  );
              }
              return null;
            }}
          >
            {expenseData.map((entry, i) => ( 
              <Cell key={`cell-${i}`} fill={chartColors[i % chartColors.length]} />
            ))}
          </Pie>
           <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                iconSize={10}
                wrapperStyle={{ paddingLeft: '15px', fontSize: '12px', lineHeight: '1.5' }}
                formatter={(value, entry) => {
                    const originalName = entry.payload?.name as CategoryName | string;
                    return chartConfig[originalName]?.label || value;
                }}
            />
        </PieChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

