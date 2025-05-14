
"use client";

import type React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CATEGORIES, Category, CategoryName, PAYMENT_METHODS, PaymentMethod, PaymentMethodName } from '@/types';
import { CategoryIcon, PaymentMethodIcon, getSelectableIcons } from '@/components/icons';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Utensils, ShoppingCart, PlusCircle, CircleHelp, type LucideIcon } from 'lucide-react';
import { useLanguage } from '@/context/language-context';

const predefinedExpenseCategories = CATEGORIES.filter(cat => cat.type === 'expense');
const predefinedPaymentMethods = PAYMENT_METHODS;

interface CustomCategory {
  name: CategoryName;
  type: 'expense';
  icon: string;
}

interface CustomPaymentMethod {
  name: PaymentMethodName;
  icon: string;
}

type DisplayCategory = Category | CustomCategory;
type DisplayPaymentMethod = PaymentMethod | CustomPaymentMethod;

const selectableIconsList = getSelectableIcons();

export function OnboardingForm() {
  const router = useRouter();
  const { toast } = useToast();
  const { language, setLanguage, translate } = useLanguage(); // Use language context

  const [selectedCategories, setSelectedCategories] = useState<Set<CategoryName>>(new Set());
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [selectedCustomCategoryIcon, setSelectedCustomCategoryIcon] = useState<string>(selectableIconsList.find(icon => icon.value === 'CircleHelp')?.value || selectableIconsList[0]?.value || '');
  const [userDefinedCategories, setUserDefinedCategories] = useState<CustomCategory[]>([]);

  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<Set<PaymentMethodName>>(new Set());
  const [customPaymentMethodInput, setCustomPaymentMethodInput] = useState('');
  const [selectedCustomPaymentMethodIcon, setSelectedCustomPaymentMethodIcon] = useState<string>(selectableIconsList.find(icon => icon.value === 'CircleHelp')?.value || selectableIconsList[0]?.value || '');
  const [userDefinedPaymentMethods, setUserDefinedPaymentMethods] = useState<CustomPaymentMethod[]>([]);

  const [budgetGoals, setBudgetGoals] = useState<Record<CategoryName, string>>({
    'Groceries': '',
    'Dining Out': '',
  });

  const allDisplayCategories: DisplayCategory[] = [
    ...predefinedExpenseCategories,
    ...userDefinedCategories
  ];

  const allDisplayPaymentMethods: DisplayPaymentMethod[] = [
    ...predefinedPaymentMethods,
    ...userDefinedPaymentMethods
  ];

  const handleLanguageChange = (value: string) => {
    setLanguage(value as 'en' | 'pt');
  };

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

  const handleAddCustomCategory = () => {
    const newCategoryName = customCategoryInput.trim() as CategoryName;
    if (!newCategoryName) {
      toast({ title: translate({en: "Invalid Name", pt: "Nome Inválido"}), description: translate({en: "Please enter a name for the category.", pt: "Por favor, insira um nome para a categoria."}), variant: "destructive" });
      return;
    }
    if (!selectedCustomCategoryIcon) {
      toast({ title: translate({en: "Icon Required", pt: "Ícone Necessário"}), description: translate({en: "Please select an icon for the category.", pt: "Por favor, selecione um ícone para a categoria."}), variant: "destructive" });
      return;
    }
    const isDuplicate = allDisplayCategories.some(cat => cat.name.toLowerCase() === newCategoryName.toLowerCase());
    if (isDuplicate) {
      toast({ title: translate({en: "Duplicate Category", pt: "Categoria Duplicada"}), description: translate({en: "This category already exists.", pt: "Essa categoria já existe."}), variant: "destructive" });
      return;
    }
    const newCustomCategory: CustomCategory = { name: newCategoryName, type: 'expense', icon: selectedCustomCategoryIcon };
    setUserDefinedCategories(prev => [...prev, newCustomCategory]);
    setSelectedCategories(prev => new Set(prev).add(newCategoryName));
    setCustomCategoryInput('');
    toast({ title: translate({en: "Category Added", pt: "Categoria Adicionada"}), description: `"${newCategoryName}" ${translate({en: "has been added.", pt: "foi adicionada."})}` });
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

  const handleAddCustomPaymentMethod = () => {
    const newMethodName = customPaymentMethodInput.trim() as PaymentMethodName;
    if (!newMethodName) {
      toast({ title: translate({en: "Invalid Name", pt: "Nome Inválido"}), description: translate({en: "Please enter a name for the payment method.", pt: "Por favor, insira um nome para o método de pagamento."}), variant: "destructive" });
      return;
    }
     if (!selectedCustomPaymentMethodIcon) {
      toast({ title: translate({en: "Icon Required", pt: "Ícone Necessário"}), description: translate({en: "Please select an icon for the method.", pt: "Por favor, selecione um ícone para o método."}), variant: "destructive" });
      return;
    }
    const isDuplicate = allDisplayPaymentMethods.some(pm => pm.name.toLowerCase() === newMethodName.toLowerCase());
    if (isDuplicate) {
      toast({ title: translate({en: "Duplicate Method", pt: "Método Duplicado"}), description: translate({en: "This payment method already exists.", pt: "Esse método de pagamento já existe."}), variant: "destructive" });
      return;
    }
    const newCustomMethod: CustomPaymentMethod = { name: newMethodName, icon: selectedCustomPaymentMethodIcon };
    setUserDefinedPaymentMethods(prev => [...prev, newCustomMethod]);
    setSelectedPaymentMethods(prev => new Set(prev).add(newMethodName));
    setCustomPaymentMethodInput('');
    toast({ title: translate({en: "Method Added", pt: "Método Adicionado"}), description: `"${newMethodName}" ${translate({en: "has been added.", pt: "foi adicionado."})}` });
  };

  const handleBudgetChange = (categoryName: CategoryName, amount: string) => {
    setBudgetGoals(prev => ({
      ...prev,
      [categoryName]: amount,
    }));
  };

  const handleSubmit = () => {
    if (selectedCategories.size === 0) {
      toast({ title: translate({en: "Selection Required", pt: "Seleção Necessária"}), description: translate({en: "Please select at least one expense category.", pt: "Por favor, selecione ao menos uma categoria de despesa."}), variant: "destructive" });
      return;
    }
    if (selectedPaymentMethods.size === 0) {
      toast({ title: translate({en: "Selection Required", pt: "Seleção Necessária"}), description: translate({en: "Please select at least one payment method.", pt: "Por favor, selecione ao menos um método de pagamento."}), variant: "destructive" });
      return;
    }

    localStorage.setItem('onboardingComplete', 'true');
    localStorage.setItem('userLanguage', language);
    localStorage.setItem('userExpenseCategories', JSON.stringify(Array.from(selectedCategories)));
    localStorage.setItem('userPaymentMethods', JSON.stringify(Array.from(selectedPaymentMethods)));
    localStorage.setItem('userDefinedCategories', JSON.stringify(userDefinedCategories));
    localStorage.setItem('userDefinedPaymentMethods', JSON.stringify(userDefinedPaymentMethods));
    localStorage.setItem('userBudgetGoals', JSON.stringify(budgetGoals));

    toast({ title: translate({en: "Setup Saved!", pt: "Configuração Salva!"}), description: translate({en: "Welcome to FinTrack!", pt: "Bem-vindo(a) ao FinTrack!"}) });
    router.push('/');
  };

  const budgetGoalCategoriesExample: { name: CategoryName; icon: LucideIcon }[] = [
    { name: 'Groceries', icon: ShoppingCart },
    { name: 'Dining Out', icon: Utensils },
  ];

  return (
    <Card className="w-full shadow-xl">
      <CardContent className="p-6 space-y-8">
        <section>
            <h2 className="text-xl font-semibold mb-1">{translate({ en: "Language", pt: "Idioma" })}</h2>
            <p className="text-sm text-muted-foreground mb-4">
                {translate({ en: "Select your preferred language.", pt: "Selecione seu idioma de preferência." })}
            </p>
            <Select value={language} onValueChange={handleLanguageChange}>
                <SelectTrigger className="w-full sm:w-[280px]">
                    <SelectValue placeholder={translate({ en: "Select language", pt: "Selecione o idioma" })} />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="pt">{translate({ en: "Portuguese (Brazil)", pt: "Português (Brasil)" })}</SelectItem>
                    <SelectItem value="en">{translate({ en: "English (US)", pt: "English (US)" })}</SelectItem>
                </SelectContent>
            </Select>
        </section>

        <Separator />

        <section>
          <h2 className="text-xl font-semibold mb-1">{translate({ en: "Select Your Expense Categories", pt: "Selecione Suas Categorias de Despesa" })}</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {translate({ en: "Choose the categories you'll use most often. You can always change them later.", pt: "Escolha as categorias que você usará com mais frequência. Você sempre pode alterá-las depois." })}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            {allDisplayCategories.map((category) => (
              <div key={category.name} className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                <Checkbox
                  id={`category-${category.name}`}
                  checked={selectedCategories.has(category.name)}
                  onCheckedChange={() => handleCategoryToggle(category.name)}
                />
                <CategoryIcon iconName={category.icon} className="h-5 w-5 text-muted-foreground" />
                <Label htmlFor={`category-${category.name}`} className="font-normal cursor-pointer">
                  {category.name}
                </Label>
              </div>
            ))}
          </div>
          <div>
            <Label htmlFor="custom-category-input" className="text-md font-medium">{translate({ en: "Add Custom Category", pt: "Adicionar Categoria Personalizada" })}</Label>
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 mt-2">
              <Input
                id="custom-category-input"
                type="text"
                value={customCategoryInput}
                onChange={(e) => setCustomCategoryInput(e.target.value)}
                placeholder={translate({ en: "New category name", pt: "Nome da nova categoria" })}
                className="flex-grow"
              />
              <Select value={selectedCustomCategoryIcon} onValueChange={setSelectedCustomCategoryIcon}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder={translate({ en: "Select an icon", pt: "Selecione um ícone" })}>
                    {selectedCustomCategoryIcon ? (
                      <div className="flex items-center gap-2">
                        <CategoryIcon iconName={selectedCustomCategoryIcon} className="h-4 w-4" />
                        <span>{selectableIconsList.find(i => i.value === selectedCustomCategoryIcon)?.label || selectedCustomCategoryIcon}</span>
                      </div>
                    ) : translate({ en: "Select an icon", pt: "Selecione um ícone" })}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {selectableIconsList.map(iconOption => (
                    <SelectItem key={iconOption.value} value={iconOption.value}>
                      <div className="flex items-center gap-2">
                        <iconOption.iconComponent className="h-4 w-4 text-muted-foreground" />
                        <span>{iconOption.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAddCustomCategory} variant="outline" size="icon" className="sm:ml-auto flex-shrink-0" aria-label={translate({en: "Add Category", pt: "Adicionar Categoria"})}>
                <PlusCircle className="h-5 w-5" />
                <span className="sr-only">{translate({ en: "Add Category", pt: "Adicionar Categoria" })}</span>
              </Button>
            </div>
          </div>
        </section>

        <Separator />

        <section>
          <h2 className="text-xl font-semibold mb-1">{translate({ en: "Select Your Payment Methods", pt: "Selecione Seus Métodos de Pagamento" })}</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {translate({ en: "Choose your primary payment methods. You can add more later.", pt: "Escolha seus principais métodos de pagamento. Você pode adicionar mais depois." })}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            {allDisplayPaymentMethods.map((method) => (
              <div key={method.name} className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                <Checkbox
                  id={`payment-${method.name}`}
                  checked={selectedPaymentMethods.has(method.name)}
                  onCheckedChange={() => handlePaymentMethodToggle(method.name)}
                />
                <PaymentMethodIcon iconName={method.icon} className="h-5 w-5 text-muted-foreground" />
                <Label htmlFor={`payment-${method.name}`} className="font-normal cursor-pointer">
                  {method.name} {(method as PaymentMethod).isDefault ? ` (${translate({en: "Default", pt: "Padrão"})})` : ''}
                </Label>
              </div>
            ))}
          </div>
           <div>
            <Label htmlFor="custom-payment-method-input" className="text-md font-medium">{translate({ en: "Add Custom Payment Method", pt: "Adicionar Método de Pagamento Personalizado" })}</Label>
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 mt-2">
              <Input
                id="custom-payment-method-input"
                type="text"
                value={customPaymentMethodInput}
                onChange={(e) => setCustomPaymentMethodInput(e.target.value)}
                placeholder={translate({ en: "New method name", pt: "Nome do novo método" })}
                className="flex-grow"
              />
              <Select value={selectedCustomPaymentMethodIcon} onValueChange={setSelectedCustomPaymentMethodIcon}>
                <SelectTrigger className="w-full sm:w-[220px]">
                   <SelectValue placeholder={translate({ en: "Select an icon", pt: "Selecione um ícone" })}>
                    {selectedCustomPaymentMethodIcon ? (
                      <div className="flex items-center gap-2">
                        <PaymentMethodIcon iconName={selectedCustomPaymentMethodIcon} className="h-4 w-4" />
                        <span>{selectableIconsList.find(i => i.value === selectedCustomPaymentMethodIcon)?.label || selectedCustomPaymentMethodIcon}</span>
                      </div>
                    ) : translate({ en: "Select an icon", pt: "Selecione um ícone" })}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {selectableIconsList.map(iconOption => (
                    <SelectItem key={iconOption.value} value={iconOption.value}>
                       <div className="flex items-center gap-2">
                        <iconOption.iconComponent className="h-4 w-4 text-muted-foreground" />
                        <span>{iconOption.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAddCustomPaymentMethod} variant="outline" size="icon" className="sm:ml-auto flex-shrink-0" aria-label={translate({en: "Add Method", pt: "Adicionar Método"})}>
                <PlusCircle className="h-5 w-5" />
                <span className="sr-only">{translate({ en: "Add Method", pt: "Adicionar Método" })}</span>
              </Button>
            </div>
          </div>
        </section>

        <Separator />

        <section>
          <h2 className="text-xl font-semibold mb-1">{translate({ en: "Set Initial Budget Goals (Optional)", pt: "Definir Metas de Orçamento Iniciais (Opcional)" })}</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {translate({ en: "Set some initial monthly budget goals for selected categories.", pt: "Defina algumas metas de orçamento mensais iniciais para as categorias selecionadas." })}
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
                  placeholder={translate({ en: "e.g., 200", pt: "ex: 200" })}
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </section>

        <Button onClick={handleSubmit} className="w-full text-lg py-6 mt-8 bg-primary hover:bg-primary/90">
          {translate({ en: "Let's Get Started!", pt: "Vamos Começar!" })}
        </Button>
      </CardContent>
    </Card>
  );
}
