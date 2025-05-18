
"use client";
import type { Transaction, TransactionType, CategoryName } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/icons";
import { formatCurrency, cn } from "@/lib/utils";
import { format as formatDateFns, parse as parseDateFns } from "date-fns"; 
import { ptBR, enUS } from 'date-fns/locale';
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

  const showSeeMoreButton = onSeeMore && !isExpanded && transactions.length > 0 && transactions.length < totalItemsForMonth && totalItemsForMonth > 5;
  const showSeeLessButton = onSeeMore && isExpanded && totalItemsForMonth > 5;

  return (
    <Card className="shadow-lg flex flex-col h-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col flex-grow">
        <div className="flex-grow"> {/* This div will contain the list or "no items" message and expand */}
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
                translate({ en: "No recent income to display. Click 'See more' to view all income for this month.", pt: "Nenhuma receita recente para exibir. Clique em 'Ver mais' para visualizar todas as receitas deste mês." }) :
                translate({ en: "No recent expenses to display. Click 'See more' to view all expenses for this month.", pt: "Nenhuma despesa recente para exibir. Clique em 'Ver mais' para visualizar todas as despesas deste mês." })
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
                return (
                  <li key={transaction.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CategoryIcon categoryName={transaction.category as CategoryName} className="h-6 w-6 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{transaction.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {displayDate} - {getCategoryLabel(transaction.category as CategoryName, language)}
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
          <div className="mt-auto pt-4 flex justify-center"> {/* mt-auto pushes to bottom, pt-4 for spacing */}
            <Button onClick={onSeeMore} variant="link" className="text-sm">
              {showSeeMoreButton ? translate({ en: "See more", pt: "Ver mais" }) : translate({ en: "See less", pt: "Ver menos"})}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

    