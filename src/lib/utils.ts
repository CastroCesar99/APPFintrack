import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Transaction } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export function exportToCsv(data: Transaction[], filename: string = 'transactions.csv'): void {
  if (data.length === 0) {
    console.warn("No data to export.");
    return;
  }

  const headers = ['ID', 'Date', 'Description', 'Amount', 'Type', 'Category'];
  const csvRows = [
    headers.join(','),
    ...data.map(transaction => [
      transaction.id,
      transaction.date,
      `"${transaction.description.replace(/"/g, '""')}"`, // Escape double quotes
      transaction.amount,
      transaction.type,
      transaction.category
    ].join(','))
  ];

  const csvString = csvRows.join('\\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
