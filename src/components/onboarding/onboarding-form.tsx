
"use client";

import type React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CATEGORIES, Category, CategoryName, PAYMENT_METHODS, PaymentMethod, PaymentMethodName } from '@/types';
import { CategoryIcon, PaymentMethodIcon } from '@/components/icons'; // Assuming PaymentMethodIcon will be created
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Utensils, ShoppingCart } from 'lucide-react'; // Specific icons for budget goals

const expenseCategories = CATEGORIES.filter(cat => cat.type === 'expense');

interface BudgetGoal {
  category: CategoryName;
  amount: string;
}

export function OnboardingForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedCategories, setSelectedCategories] = useState<Set<CategoryName>>(new Set());
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<Set<PaymentMethodName>>(new Set());
  const [budgetGoals, setBudgetGoals] = useState<Record<CategoryName, string>>({
    'Groceries': '', // Matching "Supermercado" from image - assuming Groceries is the key
    'Dining Out': '', // Matching "Alimentação" from image - assuming Dining Out is the key
  });

  const handleCategoryToggle = (categoryName: CategoryName) => {
    setSelectedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryName)) {
        newSet.delete(categoryName);
      } else {
        newSet.add(categoryName);
      }
      return newSet;
    });
  };

  const handlePaymentMethodToggle = (methodName: PaymentMethodName) => {
    setSelectedPaymentMethods(prev => {
      const newSet = new Set(prev);
      if (newSet.has(methodName)) {
        newSet.delete(methodName);
      } else {
        newSet.add(methodName);
      }
      return newSet;
    });
  };

  const handleBudgetChange = (categoryName: CategoryName, amount: string) => {
    setBudgetGoals(prev => ({
      ...prev,
      [categoryName]: amount,
    }));
  };

  const handleSubmit = () => {
    // Basic validation
    if (selectedCategories.size === 0) {
      toast({ title: "Seleção Necessária", description: "Por favor, selecione ao menos uma categoria de despesa.", variant: "destructive" });
      return;
    }
    if (selectedPaymentMethods.size === 0) {
      toast({ title: "Seleção Necessária", description: "Por favor, selecione ao menos um método de pagamento.", variant: "destructive" });
      return;
    }

    // In a real app, you'd save these preferences to a backend or more robust local storage
    localStorage.setItem('onboardingComplete', 'true');
    localStorage.setItem('userExpenseCategories', JSON.stringify(Array.from(selectedCategories)));
    localStorage.setItem('userPaymentMethods', JSON.stringify(Array.from(selectedPaymentMethods)));
    localStorage.setItem('userBudgetGoals', JSON.stringify(budgetGoals));

    toast({ title: "Configuração Salva!", description: "Bem-vindo(a) ao FinTrack!" });
    router.push('/');
  };

  // Categories for budget goals as per the image
  const budgetGoalCategoriesExample: { name: CategoryName; icon: React.ElementType }[] = [
    { name: 'Groceries', icon: ShoppingCart }, // "Supermercado"
    { name: 'Dining Out', icon: Utensils }, // "Alimentação"
  ];


  return (
    <Card className="w-full shadow-xl">
      <CardContent className="p-6 space-y-8">
        {/* Expense Categories Section */}
        <section>
          <h2 className="text-xl font-semibold mb-1">Selecione Suas Categorias de Despesa</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Escolha as categorias que você usará com mais frequência. Você sempre pode alterá-las depois.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {expenseCategories.map((category) => (
              <div key={category.name} className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                <Checkbox
                  id={`category-${category.name}`}
                  checked={selectedCategories.has(category.name)}
                  onCheckedChange={() => handleCategoryToggle(category.name)}
                />
                <CategoryIcon categoryName={category.name} className="h-5 w-5 text-muted-foreground" />
                <Label htmlFor={`category-${category.name}`} className="font-normal cursor-pointer">
                  {category.name}
                </Label>
              </div>
            ))}
          </div>
        </section>

        <Separator />

        {/* Payment Methods Section */}
        <section>
          <h2 className="text-xl font-semibold mb-1">Selecione Seus Métodos de Pagamento</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Escolha seus principais métodos de pagamento. Você pode adicionar mais depois.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PAYMENT_METHODS.map((method) => (
              <div key={method.name} className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                <Checkbox
                  id={`payment-${method.name}`}
                  checked={selectedPaymentMethods.has(method.name)}
                  onCheckedChange={() => handlePaymentMethodToggle(method.name)}
                />
                <PaymentMethodIcon methodName={method.name} className="h-5 w-5 text-muted-foreground" />
                <Label htmlFor={`payment-${method.name}`} className="font-normal cursor-pointer">
                  {method.name} {method.isDefault ? '(Padrão)' : ''}
                </Label>
              </div>
            ))}
          </div>
        </section>
        
        <Separator />

        {/* Initial Budget Goals Section */}
        <section>
          <h2 className="text-xl font-semibold mb-1">Definir Metas de Orçamento Iniciais (Opcional)</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Defina algumas metas de orçamento mensais iniciais para as categorias selecionadas.
          </p>
          <div className="space-y-4">
            {budgetGoalCategoriesExample.map(goalCategory => (
              <div key={goalCategory.name} className="flex items-center space-x-3">
                <goalCategory.icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <Label htmlFor={`budget-${goalCategory.name}`} className="w-40 truncate flex-shrink-0">
                  {goalCategory.name}
                </Label>
                <Input
                  type="number"
                  id={`budget-${goalCategory.name}`}
                  value={budgetGoals[goalCategory.name as CategoryName] || ''}
                  onChange={(e) => handleBudgetChange(goalCategory.name as CategoryName, e.target.value)}
                  placeholder="ex: 200"
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </section>

        <Button onClick={handleSubmit} className="w-full text-lg py-6 mt-8 bg-primary hover:bg-primary/90">
          Vamos Começar!
        </Button>
      </CardContent>
    </Card>
  );
}
