
export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  date: string; // ISO string for date, e.g., "2024-07-15"
  description: string;
  amount: number;
  type: TransactionType;
  category: CategoryName;
}

export const CATEGORIES = [
  { name: 'Salary', icon: 'Briefcase', type: 'income' },
  { name: 'Freelance', icon: 'Laptop', type: 'income' },
  { name: 'Investment', icon: 'TrendingUp', type: 'income' },
  { name: 'Gifts Received', icon: 'Gift', type: 'income' },
  { name: 'Other Income', icon: 'DollarSign', type: 'income' },
  { name: 'Groceries', icon: 'ShoppingCart', type: 'expense' }, // Used in onboarding example
  { name: 'Rent/Mortgage', icon: 'Home', type: 'expense' },
  { name: 'Utilities', icon: 'Zap', type: 'expense' },
  { name: 'Subscriptions', icon: 'Replace', type: 'expense' },
  { name: 'Dining Out', icon: 'Utensils', type: 'expense' }, // Used in onboarding example
  { name: 'Transport', icon: 'Car', type: 'expense' },
  { name: 'Healthcare', icon: 'HeartPulse', type: 'expense' },
  { name: 'Entertainment', icon: 'Film', type: 'expense' },
  { name: 'Shopping', icon: 'ShoppingBag', type: 'expense' },
  { name: 'Travel', icon: 'Plane', type: 'expense' }, // Onboarding example
  { name: 'Education', icon: 'BookOpen', type: 'expense' }, // Onboarding example
  { name: 'Personal Care', icon: 'Sparkles', type: 'expense'}, // For "Cuidados Pessoais" from image
  { name: 'Gifts/Donations', icon: 'Gift', type: 'expense' }, // Onboarding example
  { name: 'Other Expense', icon: 'CircleHelp', type: 'expense' }, // Onboarding example
] as const;

export type CategoryName = typeof CATEGORIES[number]['name'];
export type Category = typeof CATEGORIES[number];

export const getCategoriesByType = (type: TransactionType): Category[] => {
  return CATEGORIES.filter(cat => cat.type === type);
};

// Payment Methods
export const PAYMENT_METHODS = [
  { name: 'Dinheiro', icon: 'Wallet', isDefault: false },
  { name: 'Cartão de Débito', icon: 'CreditCard', isDefault: false },
  { name: 'Cartão de Crédito', icon: 'CreditCard', isDefault: true }, 
  // Add more payment methods here if needed
] as const;

export type PaymentMethodName = typeof PAYMENT_METHODS[number]['name'];
export type PaymentMethod = typeof PAYMENT_METHODS[number];
