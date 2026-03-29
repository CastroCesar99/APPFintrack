"use client";
import type { Transaction } from "@/types";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react"; // Changed from custom ExportIcon to Lucide's FileText
import { exportToCsv } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/context/language-context";

interface ExportDataProps {
  transactions: Transaction[];
}

export function ExportData({ transactions }: ExportDataProps) {
  const { toast } = useToast();
  const { translate } = useLanguage();

  const handleExport = () => {
    if (transactions.length === 0) {
      toast({
        title: translate({ en: "No Data", pt: "Sem Dados" }),
        description: translate({ en: "There are no transactions to export.", pt: "Não há transações para exportar." }),
        variant: "destructive",
      });
      return;
    }
    exportToCsv(transactions, "athena_transactions.csv");
    toast({
      title: translate({ en: "Export Successful", pt: "Exportação Bem-sucedida" }),
      description: translate({ en: "Your transactions have been exported to CSV.", pt: "Suas transações foram exportadas para CSV." }),
    });
  };

  return (
    <Button 
      onClick={handleExport} 
      variant="outline" 
      size="sm" 
      className="w-full sm:w-auto" // Added responsive width
    >
      <FileText className="mr-2 h-4 w-4" /> 
      {translate({ en: "Export CSV", pt: "Exportar CSV" })}
    </Button>
  );
}
