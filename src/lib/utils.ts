import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { v4 as uuidv4 } from 'uuid';
import type { Transaction } from "@/types";

export function cn(...inputs: ClassValue[]): string {
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
 transaction.category,
      transaction.paymentMethod ?? '', // Add paymentMethod
      transaction.installments?.toString() ?? '' // Add installments
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

export function generateFutureTransactions(transaction: Transaction): Transaction[] {
  const futureTransactions: Transaction[] = [transaction];
  const { paymentMethod, installments, date, isRecurring, ...rest } = transaction;
  
  if (paymentMethod === 'installment' && installments && installments > 1) {
    let remainingInstallments = installments - 1;
    let currentDate = new Date(date);

    for (let i = 0; i < remainingInstallments; i++) {
      currentDate.setMonth(currentDate.getMonth() + 1);
      futureTransactions.push({
        ...rest,
        id: uuidv4(), // Generate a new unique ID for each future transaction
        date: currentDate.toISOString().split('T')[0], // Format date as YYYY-MM-DD
        paymentMethod: 'installment',
        installments: remainingInstallments - i,
 isRecurring: false, // Future installments are not recurring themselves
      });
    }
  } else if (isRecurring) {
    const numberOfFutureMonths = 12; // Generate for the next 1 year by default, can be adjusted
    let currentDate = new Date(date);

    for (let i = 0; i < numberOfFutureMonths; i++) {
      currentDate.setMonth(currentDate.getMonth() + 1);
      futureTransactions.push({
        ...rest,
        id: uuidv4(), // Generate a new unique ID for each future transaction
        date: currentDate.toISOString().split('T')[0], // Format date as YYYY-MM-DD
 isRecurring: true,
        paymentMethod: paymentMethod, // Keep the original payment method for recurring
      });
    }
  }

  return futureTransactions;
}
