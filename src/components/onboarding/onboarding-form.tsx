
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
import type { Category, CategoryName, PaymentMethod, PaymentMethodName, DisplayCategory, DisplayPaymentMethod, CustomCategoryData, CustomPaymentMethodData, UserPreferences, TransactionType } from '@/types';
import { CATEGORIES, PAYMENT_METHODS, getCategoryDisplayLabel, getPaymentMethodDisplayLabel } from '@/types';
import { CategoryIcon, PaymentMethodIcon, getSelectableIcons, iconNameToComponentMap } from '@/components/icons';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { PlusCircle, CircleHelp, type LucideIcon } from 'lucide-react';
import { useLanguage } from '@/context/language-context';
import { useAuth } from '@/context/auth-context';
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { format as formatDateFns } from 'date-fns';

const selectableIconsList = getSelectableIcons();

export function OnboardingForm() {
  const router = useRouter();
  const { toast } = useToast();
  const { language, setLanguage, translate } = useLanguage();
  const { user, loading: authLoading } = useAuth();

  const [isSaving, setIsSaving] = useState(false);

  const [selectedCategories, setSelectedCategories] = useState<Set<CategoryName>>(new Set());
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [selectedCustomCategoryIcon, setSelectedCustomCategoryIcon] = useState<string>(selectableIconsList.find(icon => icon.value === 'CircleHelp')?.value || selectableIconsList[0]?.value || '');
  const [userDefinedCategories, setUserDefinedCategories] = useState<CustomCategoryData[]>([]);

  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<Set<PaymentMethodName>>(new Set());
  const [customPaymentMethodInput, setCustomPaymentMethodInput] = useState('');
  const [selectedCustomPaymentMethodIcon, setSelectedCustomPaymentMethodIcon] = useState<string>(selectableIconsList.find(icon => icon.value === 'Wallet')?.value || selectableIconsList[0]?.value || '');
  const [userDefinedPaymentMethods, setUserDefinedPaymentMethods] = useState<CustomPaymentMethodData[]>([]);

  const [budgetGoals, setBudgetGoals] = useState<Record<string, string>>({});


  // Initialize with all predefined expense categories selected by default
  useEffect(() => {
    const defaultSelectedExpenseCategories = new Set(
      CATEGORIES.filter(cat => cat.type === 'expense').map(cat => cat.name)
    );
    setSelectedCategories(defaultSelectedExpenseCategories);

    const defaultSelectedPaymentMethods = new Set(
        PAYMENT_METHODS.map(pm => pm.name)
    );
    setSelectedPaymentMethods(defaultSelectedPaymentMethods);

  }, []);


  const allDisplayCategories: DisplayCategory[] = [
    ...CATEGORIES.filter(cat => cat.type === 'expense'), // Only expense categories for selection
    ...userDefinedCategories
  ];

  const allDisplayPaymentMethods: DisplayPaymentMethod[] = [
    ...PAYMENT_METHODS,
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
    const newCategoryName = customCategoryInput.trim();
    if (!newCategoryName) {
      toast({ title: translate({en: "Invalid Name", pt: "Nome Inválido"}), description: translate({en: "Please enter a name for the category.", pt: "Por favor, insira um nome para a categoria."}), variant: "destructive" });
      return;
    }
    if (!selectedCustomCategoryIcon) {
      toast({ title: translate({en: "Icon Required", pt: "Ícone Necessário"}), description: translate({en: "Please select an icon for the category.", pt: "Por favor, selecione um ícone para a categoria."}), variant: "destructive" });
      return;
    }
    const isDuplicate = allDisplayCategories.some(cat => getCategoryDisplayLabel(cat, language).toLowerCase() === newCategoryName.toLowerCase() || cat.name.toLowerCase() === newCategoryName.toLowerCase());
    if (isDuplicate) {
      toast({ title: translate({en: "Duplicate Category", pt: "Categoria Duplicada"}), description: translate({en: "This category already exists.", pt: "Essa categoria já existe."}), variant: "destructive" });
      return;
    }
    const newCustomCategory: CustomCategoryData = {
      name: newCategoryName,
      type: 'expense', // Custom categories from onboarding are expenses
      icon: selectedCustomCategoryIcon,
      label: { en: newCategoryName, pt: newCategoryName }
    };
    setUserDefinedCategories(prev => [...prev, newCustomCategory]);
    setSelectedCategories(prev => new Set(prev).add(newCustomCategory.name as CategoryName));
    setCustomCategoryInput('');
    setSelectedCustomCategoryIcon(selectableIconsList.find(icon => icon.value === 'CircleHelp')?.value || selectableIconsList[0]?.value || '');
    toast({ title: translate({en: "Category Added", pt: "Categoria Adicionada"}), description: `${getCategoryDisplayLabel(newCustomCategory, language)} ${translate({en: "has been added.", pt: "foi adicionada."})}` });
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
    const newMethodName = customPaymentMethodInput.trim();
    if (!newMethodName) {
      toast({ title: translate({en: "Invalid Name", pt: "Nome Inválido"}), description: translate({en: "Please enter a name for the payment method.", pt: "Por favor, insira um nome para o método de pagamento."}), variant: "destructive" });
      return;
    }
     if (!selectedCustomPaymentMethodIcon) {
      toast({ title: translate({en: "Icon Required", pt: "Ícone Necessário"}), description: translate({en: "Please select an icon for the method.", pt: "Por favor, selecione um ícone para o método."}), variant: "destructive" });
      return;
    }
    const isDuplicate = allDisplayPaymentMethods.some(pm => getPaymentMethodDisplayLabel(pm, language).toLowerCase() === newMethodName.toLowerCase() || pm.name.toLowerCase() === newMethodName.toLowerCase());
    if (isDuplicate) {
      toast({ title: translate({en: "Duplicate Method", pt: "Método Duplicado"}), description: translate({en: "This payment method already exists.", pt: "Esse método de pagamento já existe."}), variant: "destructive" });
      return;
    }
    const newCustomMethod: CustomPaymentMethodData = {
      name: newMethodName,
      icon: selectedCustomPaymentMethodIcon,
      label: { en: newMethodName, pt: newMethodName }
    };
    setUserDefinedPaymentMethods(prev => [...prev, newCustomMethod]);
    setSelectedPaymentMethods(prev => new Set(prev).add(newCustomMethod.name as PaymentMethodName));
    setCustomPaymentMethodInput('');
    setSelectedCustomPaymentMethodIcon(selectableIconsList.find(icon => icon.value === 'Wallet')?.value || selectableIconsList[0]?.value || '');
    toast({ title: translate({en: "Method Added", pt: "Método Adicionado"}), description: `${getPaymentMethodDisplayLabel(newCustomMethod, language)} ${translate({en: "has been added.", pt: "foi adicionado."})}` });
  };

  const handleBudgetChange = (categoryName: string, amount: string) => {
    if (amount === '' || /^\d*\.?\d*$/.test(amount)) {
      setBudgetGoals(prev => ({
        ...prev,
        [categoryName]: amount,
      }));
    }
  };

  const handleSubmit = async () => {
    console.log("handleSubmit function called");
    if (!user) {
      toast({ title: translate({en: "Error", pt: "Erro"}), description: translate({en: "User not authenticated.", pt: "Usuário não autenticado."}), variant: "destructive" });
      return;
    }
    if (selectedCategories.size === 0) {
      toast({ title: translate({en: "Selection Required", pt: "Seleção Necessária"}), description: translate({en: "Please select at least one expense category.", pt: "Por favor, selecione ao menos uma categoria de despesa."}), variant: "destructive" });
      return;
    }
    if (selectedPaymentMethods.size === 0) {
      toast({ title: translate({en: "Selection Required", pt: "Seleção Necessária"}), description: translate({en: "Please select at least one payment method.", pt: "Por favor, selecione ao menos um método de pagamento."}), variant: "destructive" });
      return;
    }

    setIsSaving(true);

    try {
 console.log("User object:", user);
      const preferencesData: UserPreferences = {
        language,
        selectedCategories: Array.from(selectedCategories),
        userDefinedCategories: userDefinedCategories.map(cat => ({ name: cat.name, icon: cat.icon, label: cat.label, type: cat.type })),
        selectedPaymentMethods: Array.from(selectedPaymentMethods),
        userDefinedPaymentMethods: userDefinedPaymentMethods.map(pm => ({ name: pm.name, icon: pm.icon, label: pm.label })),
        updatedAt: serverTimestamp(),
      };

      const preferencesDocRef = doc(db, `users/${user.uid}/preferences`, "userPreferences");
 console.log("Saving preferencesData:", preferencesData);
 const preferencesResult = await setDoc(preferencesDocRef, preferencesData, { merge: true });
 console.log("Preferences setDoc result:", preferencesResult);

      const finalBudgetGoalsToSave: Record<string, number> = {};
      let hasBudgetGoals = false;
      for (const [catName, amountStr] of Object.entries(budgetGoals)) {
        if (selectedCategories.has(catName as CategoryName) && amountStr && amountStr.trim() !== '') {
          const amountNum = parseFloat(amountStr.replace(',', '.'));
          if (!isNaN(amountNum) && amountNum > 0) {
            finalBudgetGoalsToSave[catName] = amountNum;
            hasBudgetGoals = true;
          }
        }
      }

      if (hasBudgetGoals) {
        const currentMonthYearKey = formatDateFns(new Date(), 'yyyy-MM');
        const budgetDocRef = doc(db, `users/${user.uid}/budgets/${currentMonthYearKey}`);
 console.log("Saving budgetGoalsToSave:", finalBudgetGoalsToSave);
 console.log("Budget Doc Ref:", `users/${user.uid}/budgets/${currentMonthYearKey}`);
 const budgetResult = await setDoc(budgetDocRef, { ...finalBudgetGoalsToSave, lastUpdated: serverTimestamp() }, { merge: true });
 console.log("Budget setDoc result:", budgetResult);
      }

      const userDocRef = doc(db, "users", user.uid);
 console.log("Updating user document:", user.uid);
 const userDocResult = await setDoc(userDocRef, {
        onboardingComplete: true,
        onboardedAt: serverTimestamp()
      }, { merge: true });
 console.log("User document setDoc result:", userDocResult);

      localStorage.setItem('onboardingComplete', 'true');
 console.log("Onboarding complete flag set in localStorage.");
      localStorage.setItem('userLanguage', language);

      toast({ title: translate({en: "Setup Saved!", pt: "Configuração Salva!"}), description: translate({en: "Welcome to FinTrack!", pt: "Bem-vindo(a) ao FinTrack!"}) });
      router.push('/');
    } catch (error) {
      console.error("Error saving onboarding data (handleSubmit):", error);
      toast({
        title: translate({en: "Save Error", pt: "Erro ao Salvar"}),
        description: translate({
          en: "Could not save your preferences. Please check your connection and try again.",
          pt: "Não foi possível salvar suas preferências. Verifique sua conexão e tente novamente."
        }),
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };


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
                    <SelectItem value="en">{translate({ en: "English (US)", pt: "Inglês (US)" })}</SelectItem>
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
                  checked={selectedCategories.has(category.name as CategoryName)}
                  onCheckedChange={() => handleCategoryToggle(category.name as CategoryName)}
                />
                <CategoryIcon iconName={category.icon} className="h-5 w-5 text-muted-foreground" />
                <Label htmlFor={`category-${category.name}`} className="font-normal cursor-pointer">
                  {getCategoryDisplayLabel(category, language)}
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
                    {(() => {
                      const foundIconOption = selectableIconsList.find(i => i.value === selectedCustomCategoryIcon);
                      return foundIconOption ? (
                        <div className="flex items-center gap-2">
                          <CategoryIcon iconName={selectedCustomCategoryIcon} className="h-4 w-4" />
                          <span>{translate(foundIconOption.label)}</span>
                        </div>
                      ) : translate({ en: "Select an icon", pt: "Selecione um ícone" });
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {selectableIconsList.map(iconOption => (
                    <SelectItem key={iconOption.value} value={iconOption.value}>
                      <div className="flex items-center gap-2">
                        <iconOption.iconComponent className="h-4 w-4 text-muted-foreground" />
                        <span>{translate(iconOption.label)}</span>
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
                  checked={selectedPaymentMethods.has(method.name as PaymentMethodName)}
                  onCheckedChange={() => handlePaymentMethodToggle(method.name as PaymentMethodName)}
                />
                <PaymentMethodIcon iconName={method.icon} className="h-5 w-5 text-muted-foreground" />
                <Label htmlFor={`payment-${method.name}`} className="font-normal cursor-pointer">
                   {getPaymentMethodDisplayLabel(method, language)}
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
                    {(() => {
                        const foundIconOption = selectableIconsList.find(i => i.value === selectedCustomPaymentMethodIcon);
                        return foundIconOption ? (
                            <div className="flex items-center gap-2">
                            <PaymentMethodIcon iconName={selectedCustomPaymentMethodIcon} className="h-4 w-4" />
                            <span>{translate(foundIconOption.label)}</span>
                            </div>
                        ) : translate({ en: "Select an icon", pt: "Selecione um ícone" });
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {selectableIconsList.map(iconOption => (
                    <SelectItem key={iconOption.value} value={iconOption.value}>
                       <div className="flex items-center gap-2">
                        <iconOption.iconComponent className="h-4 w-4 text-muted-foreground" />
                        <span>{translate(iconOption.label)}</span>
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
            {Array.from(selectedCategories).map(categoryKey => {
              const categoryDetails = allDisplayCategories.find(c => c.name === categoryKey && c.type === 'expense');
              if (!categoryDetails) {
                return null;
              }

              const IconComponent = iconNameToComponentMap[categoryDetails.icon] || CircleHelp;

              return (
                <div key={categoryKey} className="flex items-center space-x-3">
                  <IconComponent className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <Label htmlFor={`budget-${categoryKey}`} className="w-40 truncate flex-shrink-0">
                    {getCategoryDisplayLabel(categoryDetails, language)}
                  </Label>
                  <Input
                    type="number" // Changed to number for better mobile keyboard and validation, parsing handled in submit
                    inputMode="decimal" // Hint for mobile keyboards
                    id={`budget-${categoryKey}`}
                    value={budgetGoals[categoryKey] || ''}
                    onChange={(e) => handleBudgetChange(categoryKey, e.target.value)}
                    placeholder={translate({ en: "e.g., 200", pt: "ex: 200" })}
                    className="w-full"
                    min="0"
                    step="0.01"
                  />
                </div>
              );
            })}
            {selectedCategories.size === 0 && (
              <p className="text-sm text-muted-foreground">
                {translate({
                  en: "Select some expense categories above to set their budget goals here.",
                  pt: "Selecione algumas categorias de despesa acima para definir suas metas de orçamento aqui."
                })}
              </p>
            )}
          </div>
        </section>

        <Button onClick={handleSubmit} className="w-full text-lg py-6 mt-8 bg-primary hover:bg-primary/90" disabled={isSaving || authLoading}>
          {isSaving ? translate({en: "Saving...", pt: "Salvando..."}) :translate({ en: "Let's Get Started!", pt: "Vamos Começar!" })}
        </Button>
      </CardContent>
    </Card>
  );
}

    