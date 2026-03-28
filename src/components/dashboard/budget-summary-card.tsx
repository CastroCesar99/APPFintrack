
"use client";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency, cn } from "@/lib/utils";
import { useLanguage } from "@/context/language-context";

interface BudgetSummaryCardProps {
  title: string;
  spentAmount: number;
  totalBudget: number;
  icon: LucideIcon;
  className?: string;
  iconClassName?: string;
  description?: string;
}

export function BudgetSummaryCard({
  title,
  spentAmount,
  totalBudget,
  icon: Icon,
  className,
  iconClassName,
  description,
}: BudgetSummaryCardProps) {
  const { translate } = useLanguage();
  const percentageUsed = totalBudget > 0 ? Math.min(Math.round((spentAmount / totalBudget) * 100), 100) : 0;

  return (
    <Card className={cn("shadow-lg", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={cn("h-5 w-5 text-muted-foreground", iconClassName)} />
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-baseline gap-x-2 text-lg font-bold sm:text-2xl">
          <span>{formatCurrency(spentAmount)}</span>
          <span className="font-normal text-muted-foreground">/</span>
          <span className="font-normal text-base text-muted-foreground">{formatCurrency(totalBudget)}</span>
        </div>
        {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
        <Progress value={percentageUsed} className="mt-2 h-2" />
        <p className="text-xs text-muted-foreground mt-1">
          {percentageUsed}% {translate({ en: "of total budget used", pt: "do orçamento total utilizado" })}
        </p>
      </CardContent>
    </Card>
  );
}
