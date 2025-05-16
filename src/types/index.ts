
export type TransactionType = 'income' | 'expense';
export type ExpenseNature = 'fixed' | 'variable';

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD string
  description: string;
  amount: number;
  type: TransactionType;
  category: CategoryName | string; // Can be predefined CategoryName or custom string
  paymentMethod?: string;
  installments?: number;
  isRecurring?: boolean;
  expenseNature?: ExpenseNature;
  userId?: string; // Optional, as it's often contextually known
  createdAt?: any; // Firestore ServerTimestamp
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
  { name: 'Other Expense', icon: 'CircleHelp', type: 'expense', label: { en: 'Other Expense', pt: 'Outras Despesas'} },
] as const;

export type CategoryName = typeof CATEGORIES[number]['name'];
export type Category = typeof CATEGORIES[number];

// For custom categories defined during onboarding
export interface CustomCategoryData {
  name: string; // Custom name, not restricted by CategoryName
  type: 'expense'; // Onboarding currently only allows custom expense categories
  icon: string; // Icon string key
  label: { en: string; pt: string }; // For display
}

// Union type for display purposes on budget page etc.
export type DisplayCategory = Category | CustomCategoryData;

export const getCategoriesByType = (type: TransactionType): Category[] => {
  return CATEGORIES.filter(cat => cat.type === type);
};

// Function to get label for DisplayCategory objects (predefined or custom with full data)
export const getCategoryDisplayLabel = (category: DisplayCategory, currentLanguage: 'en' | 'pt'): string => {
  if (category.label && typeof category.label === 'object' && category.label[currentLanguage]) {
    return category.label[currentLanguage];
  }
  // Fallback for custom categories where label might just be the name
  if (typeof category.label === 'string') {
    return category.label;
  }
  return category.name; // Final fallback
};

// Function to get label for CategoryName string (predefined or custom name string)
export const getCategoryLabel = (categoryName: CategoryName | string, currentLanguage: 'en' | 'pt'): string => {
  const predefinedCategory = CATEGORIES.find(cat => cat.name === categoryName);
  if (predefinedCategory && predefinedCategory.label && predefinedCategory.label[currentLanguage]) {
    return predefinedCategory.label[currentLanguage];
  }
  // If it's not a predefined category (i.e., it's a custom category name string),
  // or if the predefined category somehow doesn't have a label for the current language,
  // return the categoryName string itself.
  return categoryName;
};


export const PAYMENT_METHODS = [
  { name: 'Cash', icon: 'Wallet', isDefault: false, label: { en: 'Cash', pt: 'Dinheiro' } },
  { name: 'Debit Card', icon: 'CreditCard', isDefault: false, label: { en: 'Debit Card', pt: 'Cartão de Débito' } },
  { name: 'Credit Card', icon: 'CreditCard', isDefault: true, label: { en: 'Credit Card', pt: 'Cartão de Crédito' } },
] as const;

export type PaymentMethodName = typeof PAYMENT_METHODS[number]['name'];
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export interface CustomPaymentMethodData {
  name: string;
  icon: string;
  label: { en: string; pt: string };
}

export type DisplayPaymentMethod = PaymentMethod | CustomPaymentMethodData;


export const getPaymentMethodDisplayLabel = (method: DisplayPaymentMethod, currentLanguage: 'en' | 'pt'): string => {
  if (method.label && typeof method.label === 'object' && method.label[currentLanguage]) {
    return method.label[currentLanguage];
  }
   if (typeof method.label === 'string') {
    return method.label;
  }
  return method.name;
};

// Function to get label for PaymentMethodName string (predefined or custom name string)
export const getPaymentMethodLabel = (methodName: PaymentMethodName | string, currentLanguage: 'en' | 'pt'): string => {
  const predefinedMethod = PAYMENT_METHODS.find(pm => pm.name === methodName);
  if (predefinedMethod && predefinedMethod.label && predefinedMethod.label[currentLanguage]) {
    return predefinedMethod.label[currentLanguage];
  }
  return methodName;
};


// For user preferences document in Firestore
export interface UserPreferences {
  language: 'en' | 'pt';
  selectedCategories: string[]; // Array of category names (can be predefined or custom)
  userDefinedCategories: CustomCategoryData[];
  selectedPaymentMethods: string[]; // Array of payment method names
  userDefinedPaymentMethods: CustomPaymentMethodData[];
  updatedAt?: any; // Firestore ServerTimestamp
}
