"use client";
import type { Transaction } from "@/types";
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
import { format, parseISO } from "date-fns";

interface TransactionsTableProps {
  transactions: Transaction[];
}

export function TransactionsTable({ transactions }: TransactionsTableProps) {
  if (transactions.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No transactions yet. Add one to get started!</p>;
  }

  // Sort transactions by date, most recent first
  const sortedTransactions = [...transactions].sort((a, b) => {
    return parseISO(b.date).getTime() - parseISO(a.date).getTime();
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
          {sortedTransactions.map((transaction) => (
            <TableRow key={transaction.id}>
              <TableCell className="whitespace-nowrap">
                {format(parseISO(transaction.date), "MMM d, yyyy")}
              </TableCell>
              <TableCell>{transaction.description}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <CategoryIcon categoryName={transaction.category} className="h-4 w-4 text-muted-foreground" />
                  <span>{transaction.category}</span>
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
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
