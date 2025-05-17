
"use client";
import type { Transaction, TransactionType, CategoryName } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/icons";
import { formatCurrency, cn } from "@/lib/utils";
import { format as formatDateFns, parse as parseDateFns } from "date-fns"; 
import { useLanguage } from "@/context/language-context";
import { getCategoryLabel } from "@/types"; 

interface RecentTransactionsSectionProps {
  title: string;
  description: string;
  transactions: Transaction[];
  type: TransactionType;
  onSeeMore?: () => void;
  isExpanded?: boolean;
  totalItemsForMonth: number;
}

export function RecentTransactionsSection({ 
  title, 
  description, 
  transactions, 
  type,
  onSeeMore,
  isExpanded,
  totalItemsForMonth
}: RecentTransactionsSectionProps) {
  const { translate, language } = useLanguage();

  const showSeeMoreButton = onSeeMore && !isExpanded && transactions.length > 0 && transactions.length < totalItemsForMonth;
  const showSeeLessButton = onSeeMore && isExpanded && totalItemsForMonth > 5; // Show "See Less" if expanded and more than 5 total

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {totalItemsForMonth === 0 ? (
           <p className="text-center text-muted-foreground py-8">
            {type === 'income' ?
              translate({ en: "No income transactions for this period.", pt: "Nenhuma transação de receita para este período." }) :
              translate({ en: "No expense transactions for this period.", pt: "Nenhuma transação de despesa para este período." })
            }
          </p>
        ) : transactions.length === 0 && isExpanded === false ? ( // No items to show initially in collapsed view, but there are items if expanded
          <p className="text-center text-muted-foreground py-8">
            {type === 'income' ?
              translate({ en: "No recent income to display. Click 'See more'.", pt: "Nenhuma receita recente para exibir. Clique em 'Ver mais'." }) :
              translate({ en: "No recent expenses to display. Click 'See more'.", pt: "Nenhuma despesa recente para exibir. Clique em 'Ver mais'." })
            }
          </p>
        ) : (
          <ul className="space-y-4">
            {transactions.map((transaction) => {
              let displayDate = transaction.date; 
              try {
                const parsedDate = parseDateFns(transaction.date, "yyyy-MM-dd", new Date(0));
                displayDate = formatDateFns(parsedDate, "MMM dd, yyyy");
              } catch (e) {
                console.warn(`Could not parse date string for display: ${transaction.date}`, e);
              }
              return (
                <li key={transaction.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CategoryIcon categoryName={transaction.category} className="h-6 w-6 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{transaction.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {displayDate} - {getCategoryLabel(transaction.category, language)}
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
        {(showSeeMoreButton || showSeeLessButton) && (
          <div className="mt-4 flex justify-center">
            <Button onClick={onSeeMore} variant="link" className="text-sm">
              {showSeeMoreButton ? translate({ en: "See more", pt: "Ver mais" }) : translate({ en: "See less", pt: "Ver menos"})}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
