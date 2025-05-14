"use client";
import type { Transaction } from "@/types";
import { Button } from "@/components/ui/button";
import { ExportIcon } from "@/components/icons";
import { exportToCsv } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface ExportDataProps {
  transactions: Transaction[];
}

export function ExportData({ transactions }: ExportDataProps) {
  const { toast } = useToast();

  const handleExport = () => {
    if (transactions.length === 0) {
      toast({
        title: "No Data",
        description: "There are no transactions to export.",
        variant: "destructive",
      });
      return;
    }
    exportToCsv(transactions, "fintrack_transactions.csv");
    toast({
      title: "Export Successful",
      description: "Your transactions have been exported to CSV.",
    });
  };

  return (
    <Button onClick={handleExport} variant="outline" size="sm">
      <ExportIcon className="mr-2 h-4 w-4" />
      Export CSV
    </Button>
  );
}
