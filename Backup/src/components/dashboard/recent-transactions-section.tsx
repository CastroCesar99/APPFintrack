
"use client";
import type { Transaction, TransactionType, CategoryName, DisplayCategory } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/icons";
import { formatCurrency, cn } from "@/lib/utils";
import { format as formatDateFns, parse as parseDateFns } from "date-fns"; 
import { ptBR, enUS } from 'date-fns/locale';
import { useLanguage } from "@/context/language-context";
import { getCategoryDisplayLabel } from "@/types"; 

interface RecentTransactionsSectionProps {
  title: string;
  description: string;
  transactions: Transaction[];
  allUserCategories: DisplayCategory[]; 
  type: TransactionType;
  onSeeMore?: () => void;
  isExpanded?: boolean;
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
  totalItemsForMonth
}: RecentTransactionsSectionProps) {
  const { translate, language } = useLanguage();

  const showSeeMoreButton = onSeeMore && !isExpanded && totalItemsForMonth > 5 && transactions.length < totalItemsForMonth;
  const showSeeLessButton = onSeeMore && isExpanded && totalItemsForMonth > 5;
  
  // console.log(`RecentTransactionsSection (${type}): Total for month: ${totalItemsForMonth}, Displaying: ${transactions.length}, isExpanded: ${isExpanded}, ShowMore: ${showSeeMoreButton}, ShowLess: ${showSeeLessButton}, AllUserCategories received:`, allUserCategories);


  return (
    <Card className="shadow-lg flex flex-col h-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col flex-grow">
        <div className="flex-grow"> 
          {totalItemsForMonth === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {type === 'income' ?
                translate({ en: "No income transactions for this period.", pt: "Nenhuma transação de receita para este período." }) :
                translate({ en: "No expense transactions for this period.", pt: "Nenhuma transação de despesa para este período." })
              }
            </p>
          ) : transactions.length === 0 && !isExpanded && totalItemsForMonth > 0 ? ( 
            <p className="text-center text-muted-foreground py-8">
              {type === 'income' ?
                translate({ en: "No recent income to display.", pt: "Nenhuma receita recente para exibir." }) : 
                translate({ en: "No recent expenses to display.", pt: "Nenhuma despesa recente para exibir." }) 
              }
            </p>
          ) : transactions.length === 0 && isExpanded ? ( 
              <p className="text-center text-muted-foreground py-8">
                  {type === 'income' ?
                  translate({ en: "No income transactions found for this period.", pt: "Nenhuma transação de receita encontrada para este período." }) :
                  translate({ en: "No expense transactions found for this period.", pt: "Nenhuma transação de despesa encontrada para este período." })
                  }
              </p>
          ) : (
            <ul className="space-y-4">
              {transactions.map((transaction) => {
                let displayDate = transaction.date; 
                try {
                  const parsedDate = parseDateFns(transaction.date, "yyyy-MM-dd", new Date(0));
                  displayDate = formatDateFns(parsedDate, language === 'pt' ? "dd 'de' MMMM, yyyy" : "MMMM dd, yyyy", { locale: language === 'pt' ? ptBR : enUS});
                } catch (e) {
                  console.warn(`RecentTransactionsSection: Could not parse date string for display: ${transaction.date}`, e);
                }

                // Find category details from allUserCategories passed from parent
                const categoryDetails = allUserCategories.find(cat => cat.name === transaction.category);
                
                const categoryDisplayName = categoryDetails 
                  ? getCategoryDisplayLabel(categoryDetails, language) 
                  : transaction.category as string; // Fallback to raw name if not found (should be rare)
                
                const categoryIconName = categoryDetails?.icon || 'CircleHelp'; // Fallback icon

                return (
                  <li key={transaction.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CategoryIcon iconName={categoryIconName} className="h-6 w-6 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{transaction.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {displayDate} - {categoryDisplayName}
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
                );
              })}
            </ul>
          )}
        </div>
        {(showSeeMoreButton || showSeeLessButton) && (
          <div className="mt-auto pt-4 flex justify-center"> 
            <Button onClick={onSeeMore} variant="link" className="text-sm">
              {showSeeMoreButton ? translate({ en: "See more", pt: "Ver mais" }) : translate({ en: "See less", pt: "Ver menos"})}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

    
