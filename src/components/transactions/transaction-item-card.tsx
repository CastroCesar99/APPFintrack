
"use client";

import type React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Edit, Trash2 } from 'lucide-react';
import type { Transaction } from '@/types';
import { getCategoryDisplayLabel, getPaymentMethodDisplayLabel } from '@/types';
import { CategoryIcon } from '@/components/icons';
import { formatCurrency, cn } from '@/lib/utils';
import { format as formatDateFns, parse as parseDateFns } from 'date-fns';
import { useLanguage } from '@/context/language-context'; // Import useLanguage

interface TransactionItemCardProps {
  transaction: Transaction;
  onEdit: (transactionId: string) => void;
  onDelete: (transactionId: string) => void;
}

export function TransactionItemCard({ transaction, onEdit, onDelete }: TransactionItemCardProps) {
  const { language, translate } = useLanguage(); // Use the hook

  let displayDate = transaction.date;
  try {
    // Ensure the date string is valid before parsing
    if (transaction.date && transaction.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const parsedDate = parseDateFns(transaction.date, "yyyy-MM-dd", new Date(0));
      // Format date according to language if desired, or keep a neutral format
      displayDate = formatDateFns(parsedDate, "MMM dd, yyyy", { locale: language === 'pt' ? require('date-fns/locale/pt-BR').default : require('date-fns/locale/en-US').default });
    } else {
      console.warn("TransactionItemCard: Unexpected date format for transaction ID " + transaction.id + ": " + transaction.date);
    }
  } catch (e) {
    console.warn("TransactionItemCard: Could not parse date string for display: " + transaction.date, e);
  }

  const categoryForDisplay: { name: string, type: Transaction['type'], icon: string, label: { en: string, pt: string } } = {
    name: transaction.category as string,
    type: transaction.type,
    icon: '', 
    label: { en: transaction.category as string, pt: transaction.category as string } 
  };
  const categoryDisplayName = getCategoryDisplayLabel(categoryForDisplay, language);
  
  const paymentMethodDisplayName = transaction.paymentMethod 
    ? getPaymentMethodDisplayLabel(
        { name: transaction.paymentMethod, icon: '', label: { en: transaction.paymentMethod, pt: transaction.paymentMethod } }, 
        language
      ) 
    : '';

  const expenseNatureDisplay = transaction.expenseNature
    ? translate({
        en: transaction.expenseNature === 'fixed' ? 'Fixed' : 'Variable',
        pt: transaction.expenseNature === 'fixed' ? 'Fixa' : 'Variável',
      })
    : '';

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-200 flex flex-col h-full">
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <CategoryIcon categoryName={transaction.category} className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
            <CardTitle className="text-base font-semibold leading-tight flex-1 break-words" title={transaction.description}>
              {transaction.description}
            </CardTitle>
          </div>
          <div
            className={cn(
              "text-lg font-bold whitespace-nowrap pl-2",
              transaction.type === "income" ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500"
            )}
          >
            {transaction.type === "income" ? "+" : "-"}
            {formatCurrency(transaction.amount)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 flex-grow space-y-1 text-xs text-muted-foreground">
        <p>
          {displayDate}
        </p>
        <p>
          {translate({ en: "Category:", pt: "Categoria:" })} {categoryDisplayName}
        </p>
        {paymentMethodDisplayName && (
          <p>
            {translate({ en: "Method:", pt: "Método:" })} {paymentMethodDisplayName}
          </p>
        )}
        {transaction.type === 'expense' && transaction.expenseType === 'installment' && transaction.installments && (
          <p>
            {translate({ en: "Installments:", pt: "Parcelas:" })} {transaction.installments}
          </p>
        )}
         {transaction.type === 'expense' && expenseNatureDisplay && (
          <p>
            {translate({ en: "Nature:", pt: "Natureza:" })} {expenseNatureDisplay}
          </p>
        )}
      </CardContent>
      <div className="px-4 pb-3 pt-2 border-t mt-auto">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(transaction.id)}
            aria-label={translate({ en: "Edit", pt: "Editar" }) + " " + transaction.description}
            className="h-8 w-8" 
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(transaction.id)}
            className="text-destructive hover:text-destructive/90 hover:bg-destructive/10 h-8 w-8"
            aria-label={translate({ en: "Delete", pt: "Excluir" }) + " " + transaction.description}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
