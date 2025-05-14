
"use client";
import { Button } from "@/components/ui/button";
import { PlusCircle, SlidersHorizontal } from "lucide-react"; // Using direct Lucide imports
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function QuickActionsSection() {
  // TODO: Implement functionality for these buttons (e.g., open modals for forms)
  const handleAddExpense = () => console.log("Add Expense clicked");
  const handleAddIncome = () => console.log("Add Income clicked");
  const handleManageBudgets = () => console.log("Manage Budgets clicked");

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Button onClick={handleAddExpense} className="w-full">
            <PlusCircle className="mr-2 h-4 w-4" /> Add Expense
          </Button>
          <Button onClick={handleAddIncome} variant="outline" className="w-full">
            <PlusCircle className="mr-2 h-4 w-4" /> Add Income
          </Button>
          <Button onClick={handleManageBudgets} variant="outline" className="w-full">
            <SlidersHorizontal className="mr-2 h-4 w-4" /> Manage Budgets
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

    