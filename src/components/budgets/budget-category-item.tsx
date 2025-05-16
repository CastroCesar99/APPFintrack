
"use client";

import type React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CategoryIcon } from '@/components/icons';
import type { Category, CategoryName } from '@/types';
import { getCategoryLabel } from '@/types';
import { useLanguage } from '@/context/language-context'; // Import useLanguage

interface BudgetCategoryItemProps {
  category: Category;
  value: string; // Budget amount as string
  onBudgetChange: (categoryName: CategoryName, amount: string) => void;
  // language prop removed, will use context instead
}

export function BudgetCategoryItem({ category, value, onBudgetChange }: BudgetCategoryItemProps) {
  const { language, translate } = useLanguage();

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newAmount = event.target.value;
    // Allow empty string or valid numbers (including decimals)
    if (newAmount === '' || /^\d*\.?\d*$/.test(newAmount)) {
      onBudgetChange(category.name, newAmount);
    }
  };
  
  const categoryDisplayName = getCategoryLabel(category.name, language);

  return (
    <Card className="w-64 flex-shrink-0 shadow-lg">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CategoryIcon categoryName={category.name} className="h-6 w-6 text-primary" />
          <CardTitle className="text-md font-semibold truncate" title={categoryDisplayName}>
            {categoryDisplayName}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <Input
          type="number"
          placeholder={translate({en: "Set budget", pt: "Definir orçamento"})}
          value={value}
          onChange={handleInputChange}
          className="text-right"
          min="0"
          step="0.01"
        />
        {/* Future: Add progress bar here */}
        {/* <Progress value={50} className="mt-2 h-2" /> */}
        {/* <p className="text-xs text-muted-foreground mt-1">Spent $50 / $100</p> */}
      </CardContent>
    </Card>
  );
}
