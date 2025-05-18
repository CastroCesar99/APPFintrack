
export type TransactionType = 'income' | 'expense';
export type ExpenseNature = 'fixed' | 'variable';
export type ExpenseType = 'upfront' | 'installment' | 'recurring';

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD string (actual transaction date)
  effectiveMonth: string; // YYYY-MM string (month it applies to for summaries/filtering)
  description: string;
  amount: number;
  type: TransactionType;
  category: CategoryName | string; // Can be predefined CategoryName or custom string
  paymentMethod?: string;
  installments?: number;
  isRecurring?: boolean;
  expenseNature?: ExpenseNature;
  expenseType?: ExpenseType;
  userId?: string;
  createdAt?: any;
  updatedAt?: any;
}

export const CATEGORIES = [
  { name: 'Salary', icon: 'Briefcase', type: 'income', label: { en: 'Salary', pt: 'Salário' } },
  { name: 'Freelance', icon: 'Laptop', type: 'income', label: { en: 'Freelance', pt: 'Freelance' } },
  { name: 'Investment', icon: 'TrendingUp', type: 'income', label: { en: 'Investment', pt: 'Investimentos' } },
  { name: 'Gifts Received', icon: 'Gift', type: 'income', label: { en: 'Gifts Received', pt: 'Presentes Recebidos' } },
  { name: 'Other Income', icon: 'DollarSign', type: 'income', label: { en: 'Other Income', pt: 'Outras Receitas' } },
  { name: 'Groceries', icon: 'ShoppingCart', type: 'expense', label: { en: 'Groceries', pt: 'Supermercado' } },
  { name: 'Rent/Mortgage', icon: 'Home', type: 'expense', label: { en: 'Rent/Mortgage', pt: 'Aluguel/Hipoteca' } },
  { name: 'Utilities', icon: 'Zap', type: 'expense', label: { en: 'Utilities', pt: 'Contas de Casa' } },
  { name: 'Subscriptions', icon: 'Replace', type: 'expense', label: { en: 'Subscriptions', pt: 'Assinaturas' } },
  { name: 'Dining Out', icon: 'Utensils', type: 'expense', label: { en: 'Dining Out', pt: 'Alimentação Fora' } },
  { name: 'Transport', icon: 'Car', type: 'expense', label: { en: 'Transport', pt: 'Transporte' } },
  { name: 'Healthcare', icon: 'HeartPulse', type: 'expense', label: { en: 'Healthcare', pt: 'Saúde' } },
  { name: 'Entertainment', icon: 'Film', type: 'expense', label: { en: 'Entertainment', pt: 'Lazer' } },
  { name: 'Shopping', icon: 'ShoppingBag', type: 'expense', label: { en: 'Shopping', pt: 'Compras' } },
  { name: 'Travel', icon: 'Plane', type: 'expense', label: { en: 'Travel', pt: 'Viagens' } },
  { name: 'Education', icon: 'BookOpen', type: 'expense', label: { en: 'Education', pt: 'Educação' } },
  { name: 'Personal Care', icon: 'Sparkles', type: 'expense', label: { en: 'Personal Care', pt: 'Cuidados Pessoais'} },
  { name: 'Gifts/Donations', icon: 'Gift', type: 'expense', label: { en: 'Gifts/Donations', pt: 'Presentes/Doações'} },
  { name: 'Pets', icon: 'PawPrint', type: 'expense', label: { en: 'Pets', pt: 'Animais de Estimação' } },
  { name: 'Other Expense', icon: 'CircleHelp', type: 'expense', label: { en: 'Other Expense', pt: 'Outras Despesas'} },
] as const;

export type CategoryName = typeof CATEGORIES[number]['name'];
export type Category = typeof CATEGORIES[number];

export interface CustomCategoryData {
  name: string; 
  type: TransactionType;
  icon: string;
  label: { en: string; pt: string }; 
}

export type DisplayCategory = Category | CustomCategoryData;


export const getCategoryDisplayLabel = (category: DisplayCategory | undefined, currentLanguage: 'en' | 'pt'): string => {
  if (!category) return '';
  if (category.label && typeof category.label === 'object' && category.label[currentLanguage]) {
    return category.label[currentLanguage];
  }
  return category.name; 
};

export const getCategoryLabel = (categoryName: CategoryName | string | undefined, currentLanguage: 'en' | 'pt'): string => {
  if (!categoryName) return '';
  const predefinedCategory = CATEGORIES.find(cat => cat.name.toLowerCase() === (categoryName as string).toLowerCase());
  if (predefinedCategory && predefinedCategory.label && predefinedCategory.label[currentLanguage]) {
    return predefinedCategory.label[currentLanguage];
  }
  // For custom categories, their 'name' field usually holds the display name, or it's already a DisplayCategory object
  // This part might need refinement if custom categories are only stored by a non-display 'name' and need label lookup.
  // However, getCategoryDisplayLabel is preferred if you have the DisplayCategory object.
  return categoryName as string; 
};


export const PAYMENT_METHODS = [
  { name: 'Cash', icon: 'Wallet', label: { en: 'Cash', pt: 'Dinheiro' } },
  { name: 'Debit Card', icon: 'CreditCard', label: { en: 'Debit Card', pt: 'Cartão de Débito' } },
  { name: 'Credit Card', icon: 'CreditCard', label: { en: 'Credit Card', pt: 'Cartão de Crédito' } },
] as const;

export type PaymentMethodName = typeof PAYMENT_METHODS[number]['name'];
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export interface CustomPaymentMethodData {
  name: string; 
  icon: string;
  label: { en: string; pt: string };
}

export type DisplayPaymentMethod = PaymentMethod | CustomPaymentMethodData;


export const getPaymentMethodDisplayLabel = (methodInput: DisplayPaymentMethod | string | undefined, currentLanguage: 'en' | 'pt'): string => {
  if (!methodInput) return '';

  let methodObject: DisplayPaymentMethod | undefined;

  if (typeof methodInput === 'string') {
    const lowerMethodInput = methodInput.toLowerCase();
    methodObject = PAYMENT_METHODS.find(pm => pm.name.toLowerCase() === lowerMethodInput);
    if (methodObject && methodObject.label && methodObject.label[currentLanguage]) {
      return methodObject.label[currentLanguage];
    }
    // If not predefined, return the input string itself (assuming it's a custom method name)
    return methodInput;
  } else {
    // It's already an object (DisplayPaymentMethod)
    methodObject = methodInput;
    if (methodObject.label && methodObject.label[currentLanguage]) {
      return methodObject.label[currentLanguage];
    }
    return methodObject.name; // Fallback to name
  }
};


export interface UserPreferences {
  language: 'en' | 'pt';
  selectedCategories: string[]; 
  userDefinedCategories: CustomCategoryData[];
  deselectedPredefinedCategories?: string[];
  selectedPaymentMethods: string[];
  userDefinedPaymentMethods: CustomPaymentMethodData[];
  deselectedPredefinedPaymentMethods?: string[];
  updatedAt?: any;
}

    