
"use client";
import type { Transaction, CategoryName } from "@/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Edit, Trash2 } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/icons";
import { format as formatDateFns, parse as parseDateFns } from "date-fns";
import { useLanguage } from "@/context/language-context";
import { getCategoryLabel } from "@/types"; 

interface TransactionsTableProps {
  transactions: Transaction[];
  onEditTransaction?: (transactionId: string) => void;
  onDeleteTransaction?: (transactionId: string) => void;
}

export function TransactionsTable({ transactions, onEditTransaction, onDeleteTransaction }: TransactionsTableProps) {
  const { language, translate } = useLanguage();

  if (transactions.length === 0) {
    return <p className="text-center text-muted-foreground py-8">
      {translate({en: "No transactions yet.", pt: "Nenhuma transação ainda."})}
    </p>;
  }

  const sortedTransactions = [...transactions].sort((a, b) => {
    return parseDateFns(b.date, "yyyy-MM-dd", new Date()).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date()).getTime();
  });


  return (
    <div className="w-full"> {/* Adjusted div to take full width */}
      <Table>
        <TableHeader className="hidden sm:table-header-group"> {/* Hide header on small screens */}
          <TableRow className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"> {/* Added base TableRow classes */}
            <TableHead className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">{translate({en:"Date", pt:"Data"})}</TableHead> {/* Added base TableHead classes */}
            <TableHead>{translate({en:"Description", pt:"Descrição"})}</TableHead>
            <TableHead>{translate({en:"Category", pt:"Categoria"})}</TableHead>
            <TableHead className="text-right">{translate({en:"Amount", pt:"Valor"})}</TableHead>
            {(onEditTransaction || onDeleteTransaction) && (
              <TableHead className="text-center">{translate({en:"Actions", pt:"Ações"})}</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedTransactions.map((transaction) => {
            let displayDate = transaction.date;
            try {
              const parsedDate = parseDateFns(transaction.date, "yyyy-MM-dd", new Date());
              displayDate = formatDateFns(parsedDate, "MMM d, yyyy");
            } catch (e) {
                console.warn(`Could not parse date string for display in table: ${transaction.date}`, e);
            }
            return (
              <TableRow key={transaction.id} className="flex flex-col mb-4 p-4 border rounded-md sm:table-row sm:mb-0 sm:p-0 sm:border-none sm:rounded-none"> {/* Stack cells vertically on mobile */}
                {/* Mobile label and data */}
                <TableCell className="flex justify-between items-center sm:table-cell sm:whitespace-nowrap sm:block"> {/* Revert to table cell on sm */}
                  <span className="font-bold mr-2 sm:hidden">{translate({en:"Date:", pt:"Data:"})}</span> {/* Label for mobile */}
                  <span className="whitespace-nowrap">{displayDate}</span>
                </TableCell>

                <TableCell className="flex justify-between items-center sm:table-cell sm:block"> {/* Revert to table cell on sm */}
                  <span className="font-bold mr-2 sm:hidden">{translate({en:"Description:", pt:"Descrição:"})}</span> {/* Label for mobile */}
                  <span>{transaction.description}</span>
                </TableCell>

                <TableCell className="flex justify-between items-center sm:table-cell sm:block"> {/* Revert to table cell on sm */}
                  <span className="font-bold mr-2 sm:hidden">{translate({en:"Category:", pt:"Categoria:"})}</span> {/* Label for mobile */}
                  <div className="flex items-center gap-2 sm:justify-start"> {/* Adjust alignment on mobile */}
                    <CategoryIcon categoryName={transaction.category} className="h-4 w-4 text-muted-foreground flex-shrink-0" /> {/* Prevent shrinking */}
                    <span className="truncate">{getCategoryLabel(transaction.category, language)}</span> {/* Truncate long category names */}
                  </div>
                </TableCell>

                <TableCell className={cn(
                    "flex justify-between items-center font-medium sm:table-cell sm:text-right sm:block", // Adjust for mobile and sm
                    transaction.type === "income" ? "text-green-500" : "text-red-500",
                  )}>
                  <span className="font-bold mr-2 sm:hidden">{translate({en:"Amount:", pt:"Valor:"})}</span> {/* Label for mobile */}
                  {transaction.type === "income" ? "+" : "-"}
                  {formatCurrency(transaction.amount)}
                </TableCell>
                {(onEditTransaction || onDeleteTransaction) && (
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      {onEditTransaction && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => onEditTransaction(transaction.id)}
                          aria-label={translate({en: "Edit", pt: "Editar"}) + " " + transaction.description}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {onDeleteTransaction && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => onDeleteTransaction(transaction.id)}
                          className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                          aria-label={translate({en: "Delete", pt: "Excluir"}) + " " + transaction.description}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

    