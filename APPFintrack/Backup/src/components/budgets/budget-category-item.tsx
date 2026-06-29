
"use client";

import type React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CategoryIcon } from '@/components/icons';
import type { DisplayCategory } from '@/types'; // Use DisplayCategory
import { getCategoryDisplayLabel } from '@/types';
import { useLanguage } from '@/context/language-context';

interface BudgetCategoryItemProps {
  category: DisplayCategory; // Updated to DisplayCategory
  value: string;
  onBudgetChange: (categoryName: string, amount: string) => void; // categoryName is now string
}

export function BudgetCategoryItem({ category, value, onBudgetChange }: BudgetCategoryItemProps) {
  const { language, translate } = useLanguage();

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newAmount = event.target.value;
    if (newAmount === '' || /^\d*\.?\d*$/.test(newAmount)) {
      onBudgetChange(category.name, newAmount);
    }
  };
  
  const categoryDisplayName = getCategoryDisplayLabel(category, language);

  return (
    <Card className="w-full shadow-lg">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CategoryIcon iconName={category.icon} className="h-6 w-6 text-primary" />
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
      </CardContent>
    </Card>
  );
}
