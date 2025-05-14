
"use client";
import type { Transaction, TransactionType } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CategoryIcon } from "@/components/icons";
import { formatCurrency, cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

interface RecentTransactionsSectionProps {
  title: string;
  description: string;
  transactions: Transaction[];
  type: TransactionType;
}

export function RecentTransactionsSection({ title, description, transactions, type }: RecentTransactionsSectionProps) {
  if (transactions.length === 0) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            No {type === 'income' ? 'income' : 'expense'} transactions yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {transactions.map((transaction) => (
            <li key={transaction.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CategoryIcon categoryName={transaction.category} className="h-6 w-6 text-muted-foreground" />
                <div>
                  <p className="font-medium">{transaction.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(parseISO(transaction.date), "MMM dd, yyyy")}
                  </p>
                </div>
              </div>
              <span className={cn(
                "font-semibold",
                transaction.type === "income" ? "text-green-500" : "text-red-500"
              )}>
                {transaction.type === "income" ? "+" : "-"}
                {formatCurrency(transaction.amount)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

    