
export type TransactionType = 'income' | 'expense';
export type ExpenseNature = 'fixed' | 'variable'; // New type for expense nature

export interface Transaction {
  id: string;
  date: string; // ISO string for date, e.g., "2024-07-15"
  description: string;
  amount: number;
  type: TransactionType;
  category: CategoryName; // Still uses the English 'name' as the identifier
  paymentMethod?: string;
  installments?: number;
  isRecurring?: boolean;
  expenseNature?: ExpenseNature; // Added expenseNature as optional
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

export type CategoryName = typeof CATEGORIES[number]['name']; // English name as the identifier
export type Category = typeof CATEGORIES[number];

export const getCategoriesByType = (type: TransactionType): Category[] => {
  return CATEGORIES.filter(cat => cat.type === type);
};

export const getCategoryLabel = (categoryName: CategoryName, currentLanguage: 'en' | 'pt'): string => {
  const category = CATEGORIES.find(cat => cat.name === categoryName);
  if (category && category.label) {
    return category.label[currentLanguage] || category.name;
  }
  // Fallback for custom categories not in the predefined list
  return categoryName;
};


// Payment Methods
export const PAYMENT_METHODS = [
  { name: 'Cash', icon: 'Wallet', isDefault: false, label: { en: 'Cash', pt: 'Dinheiro' } },
  { name: 'Debit Card', icon: 'CreditCard', isDefault: false, label: { en: 'Debit Card', pt: 'Cartão de Débito' } },
  { name: 'Credit Card', icon: 'CreditCard', isDefault: true, label: { en: 'Credit Card', pt: 'Cartão de Crédito' } },
] as const;

export type PaymentMethodName = typeof PAYMENT_METHODS[number]['name']; // English name as the identifier
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export const getPaymentMethodLabel = (methodName: PaymentMethodName, currentLanguage: 'en' | 'pt'): string => {
  const method = PAYMENT_METHODS.find(m => m.name === methodName);
  if (method && method.label) {
    return method.label[currentLanguage] || method.name;
  }
  // Fallback for custom payment methods
  return methodName;
};
