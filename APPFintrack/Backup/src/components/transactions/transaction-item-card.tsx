
"use client";

import type React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Edit, Trash2 } from 'lucide-react';
import type { Transaction, DisplayCategory } from '@/types'; // Added DisplayCategory
import { getCategoryDisplayLabel, getPaymentMethodDisplayLabel, CATEGORIES } from '@/types'; 
import { CategoryIcon } from '@/components/icons';
import { formatCurrency, cn } from '@/lib/utils';
import { format as formatDateFns, parse as parseDateFns } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';
import { useLanguage } from '@/context/language-context';

interface TransactionItemCardProps {
  transaction: Transaction;
  onEdit: (transactionId: string) => void;
  onDelete: (transactionId: string) => void;
  allUserCategories: DisplayCategory[]; // Added this prop
}

export function TransactionItemCard({ transaction, onEdit, onDelete, allUserCategories }: TransactionItemCardProps) {
  const { language, translate } = useLanguage();

  let displayDate = transaction.date;
  try {
    if (transaction.date && transaction.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const parsedDate = parseDateFns(transaction.date, "yyyy-MM-dd", new Date(0));
      displayDate = formatDateFns(parsedDate, language === 'pt' ? "dd 'de' MMMM, yyyy" : "MMMM dd, yyyy", { locale: language === 'pt' ? ptBR : enUS });
    } else {
      console.warn("TransactionItemCard: Unexpected date format for transaction ID " + transaction.id + ": " + transaction.date);
    }
  } catch (e) {
    console.warn("TransactionItemCard: Could not parse date string for display: " + transaction.date, e);
  }
  
  // Find category details from allUserCategories passed from parent
  const categoryDetailsFromUserList = allUserCategories.find(
    (cat) => cat.name.toLowerCase() === (transaction.category as string).toLowerCase()
  );

  const finalCategoryDetails: DisplayCategory = categoryDetailsFromUserList || 
                            CATEGORIES.find(c => c.name.toLowerCase() === (transaction.category as string).toLowerCase()) || 
                            { 
                              name: transaction.category as string, 
                              type: transaction.type, 
                              icon: 'CircleHelp', 
                              label: { en: transaction.category as string, pt: transaction.category as string }
                            };
  
  const categoryDisplayName = getCategoryDisplayLabel(finalCategoryDetails, language);
  const categoryIconName = finalCategoryDetails.icon;

  const paymentMethodDisplayName = transaction.paymentMethod
    ? getPaymentMethodDisplayLabel(transaction.paymentMethod, language)
    : '';
  
  const expenseNatureDisplay = transaction.expenseNature
    ? translate({
        en: transaction.expenseNature.charAt(0).toUpperCase() + transaction.expenseNature.slice(1), 
        pt: transaction.expenseNature === 'fixed' ? 'Fixo' : 'Variável',
      })
    : '';

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-200 flex flex-col h-full">
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <CategoryIcon iconName={categoryIconName} className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
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
            {/* Description already includes installment info from projection logic */}
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
