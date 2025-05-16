
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
import { Badge } from "@/components/ui/badge";
import { formatCurrency, cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/icons";
import { format as formatDateFns, parse as parseDateFns } from "date-fns"; // Import parse for YYYY-MM-DD
import { useLanguage } from "@/context/language-context";
import { getCategoryLabel } from "@/types"; 

interface TransactionsTableProps {
  transactions: Transaction[];
}

export function TransactionsTable({ transactions }: TransactionsTableProps) {
  const { language } = useLanguage();

  if (transactions.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No transactions yet. Add one to get started!</p>;
  }

  // Sort transactions by date, most recent first
  const sortedTransactions = [...transactions].sort((a, b) => {
    // Parse YYYY-MM-DD strings for comparison
    return parseDateFns(b.date, "yyyy-MM-dd", new Date()).getTime() - parseDateFns(a.date, "yyyy-MM-dd", new Date()).getTime();
  });


  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Amount</TableHead>
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
              <TableRow key={transaction.id}>
                <TableCell className="whitespace-nowrap">
                  {displayDate}
                </TableCell>
                <TableCell>{transaction.description}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <CategoryIcon categoryName={transaction.category} className="h-4 w-4 text-muted-foreground" />
                    <span>{getCategoryLabel(transaction.category, language)}</span>
                  </div>
                </TableCell>
                <TableCell className={cn(
                    "text-right font-medium",
                    transaction.type === "income" ? "text-green-500" : "text-red-500"
                  )}>
                  {transaction.type === "income" ? "+" : "-"}
                  {formatCurrency(transaction.amount)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

