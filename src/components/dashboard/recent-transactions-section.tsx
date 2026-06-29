
"use client";

import type React from 'react';
import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TransactionItemCard } from "@/components/transactions/transaction-item-card";
import type { Transaction, DisplayCategory } from "@/types";
import { useLanguage } from '@/context/language-context';

interface RecentTransactionsSectionProps {
  title: string;
  description: string;
  transactions: Transaction[];
  allUserCategories: DisplayCategory[];
  type: 'income' | 'expense';
  onSeeMore: () => void;
  isExpanded: boolean;
  totalItemsForMonth: number;
}

export function RecentTransactionsSection({
  title,
  description,
  transactions,
  allUserCategories,
  type,
  onSeeMore,
  isExpanded,
  totalItemsForMonth,
}: RecentTransactionsSectionProps) {
  const { translate } = useLanguage();

  // No internal state for categories, directly use the prop 'allUserCategories'
  // This ensures the component re-renders when the prop changes.
  const categoryMap = useMemo(() => {
    const map = new Map<string, DisplayCategory>();
    allUserCategories.forEach(cat => map.set(cat.name, cat));
    return map;
  }, [allUserCategories]);

  const transactionsWithCategoryDetails = useMemo(() => {
    return transactions.map(t => ({
      ...t,
      categoryDetails: categoryMap.get(t.category)
    }));
  }, [transactions, categoryMap]);

  const noTransactionsMessage = type === 'income' 
    ? translate({ en: "No income recorded for this period.", pt: "Nenhuma receita registrada para este período." })
    : translate({ en: "No expenses recorded for this period.", pt: "Nenhuma despesa registrada para este período." });

  const seeMoreButtonLabel = isExpanded 
    ? translate({ en: 'Show Less', pt: 'Mostrar Menos' })
    : `${translate({ en: 'See All', pt: 'Ver Todos' })} (${totalItemsForMonth})`;

  return (
    <Card className="shadow-md bg-muted/50">
      <CardHeader>
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {transactionsWithCategoryDetails.length > 0 ? (
          <div className="space-y-4">
            {transactionsWithCategoryDetails.map((transaction) => (
              <TransactionItemCard 
                key={transaction.id} 
                transaction={transaction} 
                category={transaction.categoryDetails} 
              />
            ))}
            {totalItemsForMonth > 5 && (
                <Button variant="link" className="w-full mt-4" onClick={onSeeMore}>
                  {seeMoreButtonLabel}
                </Button>
            )}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            {noTransactionsMessage}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
