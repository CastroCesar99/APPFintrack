
"use client";

import type React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Edit, Trash2 } from 'lucide-react';
import type { Transaction } from '@/types';
import { getCategoryLabel } from '@/types';
import { CategoryIcon } from '@/components/icons';
import { formatCurrency, cn } from '@/lib/utils';
import { format as formatDateFns, parse as parseDateFns } from 'date-fns';
import { useLanguage } from '@/context/language-context';

interface TransactionItemCardProps {
  transaction: Transaction;
  onEdit: (transactionId: string) => void;
  onDelete: (transactionId: string) => void;
}

export function TransactionItemCard({ transaction, onEdit, onDelete }: TransactionItemCardProps) {
  const { language, translate } = useLanguage();

  let displayDate = transaction.date;
  try {
    const parsedDate = parseDateFns(transaction.date, "yyyy-MM-dd", new Date(0));
    displayDate = formatDateFns(parsedDate, "MMM dd, yyyy");
  } catch (e) {
    console.warn(`Could not parse date string for display in card: ${transaction.date}`, e);
  }

  const categoryDisplayName = getCategoryLabel(transaction.category, language);

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-200 flex flex-col h-full">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <CategoryIcon categoryName={transaction.category} className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <CardTitle className="text-base font-semibold truncate" title={transaction.description}>
              {transaction.description}
            </CardTitle>
          </div>
          <div
            className={cn(
              "text-lg font-bold whitespace-nowrap",
              transaction.type === "income" ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500"
            )}
          >
            {transaction.type === "income" ? "+" : "-"}
            {formatCurrency(transaction.amount)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 flex-grow">
        <p className="text-xs text-muted-foreground">
          {displayDate}
        </p>
        <p className="text-xs text-muted-foreground truncate" title={categoryDisplayName}>
          {translate({ en: "Category:", pt: "Categoria:" })} {categoryDisplayName}
        </p>
        {transaction.paymentMethod && (
          <p className="text-xs text-muted-foreground truncate">
            {translate({ en: "Method:", pt: "Método:" })} {transaction.paymentMethod}
          </p>
        )}
        {transaction.expenseType === 'installment' && transaction.installments && (
          <p className="text-xs text-muted-foreground">
            {/* This part needs logic to calculate current installment, for now shows total */}
            {translate({ en: "Installments:", pt: "Parcelas:" })} {transaction.installments}
          </p>
        )}
         {transaction.expenseNature && (
          <p className="text-xs text-muted-foreground">
            {translate({ en: "Nature:", pt: "Natureza:" })} {transaction.expenseNature === 'fixed' ? translate({en: "Fixed", pt: "Fixa"}) : translate({en:"Variable", pt:"Variável"})}
          </p>
        )}
      </CardContent>
      <div className="px-4 pb-4 pt-2 border-t border-border/50 mt-auto">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(transaction.id)}
            aria-label={translate({ en: "Edit", pt: "Editar" }) + " " + transaction.description}
            className="h-7 w-7"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(transaction.id)}
            className="text-destructive hover:text-destructive/90 hover:bg-destructive/10 h-7 w-7"
            aria-label={translate({ en: "Delete", pt: "Excluir" }) + " " + transaction.description}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
