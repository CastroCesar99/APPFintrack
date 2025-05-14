
"use client";
import type { Transaction, TransactionType, CategoryName } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CategoryIcon } from "@/components/icons";
import { formatCurrency, cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { useLanguage } from "@/context/language-context";
import { getCategoryLabel } from "@/types"; // Import helper

interface RecentTransactionsSectionProps {
  title: string;
  description: string;
  transactions: Transaction[];
  type: TransactionType;
}

export function RecentTransactionsSection({ title, description, transactions, type }: RecentTransactionsSectionProps) {
  const { translate, language } = useLanguage();

  if (transactions.length === 0) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            {type === 'income' ?
              translate({ en: "No income transactions yet.", pt: "Nenhuma transação de receita ainda." }) :
              translate({ en: "No expense transactions yet.", pt: "Nenhuma transação de despesa ainda." })
            }
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
                {/* Assuming transaction.category is the English name/key */}
                <CategoryIcon categoryName={transaction.category} className="h-6 w-6 text-muted-foreground" />
                <div>
                  <p className="font-medium">{transaction.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(parseISO(transaction.date), "MMM dd, yyyy")} - {getCategoryLabel(transaction.category, language)}
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
