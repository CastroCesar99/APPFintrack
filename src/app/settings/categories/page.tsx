
"use client";

import React from 'react';
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryIcon } from "@/components/icons";
import { Edit, Trash2, PlusCircle, TrendingUp, TrendingDown } from "lucide-react";
import { CATEGORIES, getCategoryLabel, type Category, type TransactionType } from "@/types";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

export default function ManageCategoriesPage() {
  const { language, translate } = useLanguage();
  const { toast } = useToast();

  // For now, we use the static list. Later, this would come from user's Firestore data.
  const userCategories: Category[] = [...CATEGORIES];

  const handleActionPlaceholder = (actionName: string, categoryName: string) => {
    toast({
      title: translate({ en: "Feature In Development", pt: "Funcionalidade em Desenvolvimento" }),
      description: `${actionName} ${translate({ en: "for", pt: "para" })} ${categoryName} ${translate({ en: "is coming soon.", pt: "está chegando em breve."})}`,
    });
  };
  
  const handleAddNewCategory = () => {
    toast({
      title: translate({ en: "Feature In Development", pt: "Funcionalidade em Desenvolvimento" }),
      description: translate({ en: "Adding new categories will be available soon.", pt: "Adicionar novas categorias estará disponível em breve."}),
    });
  };

  const getCategoryTypeLabel = (type: TransactionType) => {
    if (type === 'income') {
      return translate({ en: "Income", pt: "Receita" });
    }
    return translate({ en: "Expense", pt: "Despesa" });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {translate({ en: "Manage Categories", pt: "Gerenciar Categorias" })}
          </h1>
          <Button onClick={handleAddNewCategory} className="w-full sm:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" />
            {translate({ en: "Add New Category", pt: "Adicionar Nova Categoria" })}
          </Button>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>{translate({ en: "Your Categories", pt: "Suas Categorias" })}</CardTitle>
            <CardDescription>
              {translate({ en: "A list of all your configured categories.", pt: "Uma lista de todas as suas categorias configuradas." })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {userCategories.length > 0 ? (
              <div className="space-y-4">
                {userCategories.map((category, index) => (
                  <React.Fragment key={category.name as string}>
                    <div className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <CategoryIcon iconName={category.icon} className="h-6 w-6 text-muted-foreground" />
                        <div className="flex flex-col">
                           <span className="font-medium">
                            {getCategoryLabel(category.name, language)}
                          </span>
                          <Badge
                            variant={category.type === 'income' ? 'secondary' : 'outline'}
                            className={`w-fit text-xs ${category.type === 'income' ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700' : 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700'}`}
                          >
                            {category.type === 'income' ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                            {getCategoryTypeLabel(category.type)}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleActionPlaceholder(translate({en:"Edit", pt: "Editar"}), getCategoryLabel(category.name, language))}
                          aria-label={translate({en: "Edit", pt: "Editar"}) + " " + getCategoryLabel(category.name, language)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleActionPlaceholder(translate({en:"Delete", pt: "Excluir"}), getCategoryLabel(category.name, language))}
                          className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                          aria-label={translate({en: "Delete", pt: "Excluir"}) + " " + getCategoryLabel(category.name, language)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {index < userCategories.length - 1 && <Separator />}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {translate({ en: "No categories configured yet.", pt: "Nenhuma categoria configurada ainda." })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
