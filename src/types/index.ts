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
  { name: 'Groceries', icon: 'ShoppingCart', type: 'expense' },
  { name: 'Rent/Mortgage', icon: 'Home', type: 'expense' },
  { name: 'Utilities', icon: 'Zap', type: 'expense' },
  { name: 'Subscriptions', icon: 'Replace', type: 'expense' },
  { name: 'Dining Out', icon: 'Utensils', type: 'expense' },
  { name: 'Transport', icon: 'Car', type: 'expense' },
  { name: 'Healthcare', icon: 'HeartPulse', type: 'expense' },
  { name: 'Entertainment', icon: 'Film', type: 'expense' },
  { name: 'Shopping', icon: 'ShoppingBag', type: 'expense' },
  { name: 'Travel', icon: 'Plane', type: 'expense' },
  { name: 'Education', icon: 'BookOpen', type: 'expense' },
  { name: 'Gifts/Donations', icon: 'Gift', type: 'expense' }, // Renamed for clarity if used for expenses
  { name: 'Other Expense', icon: 'CircleHelp', type: 'expense' },
] as const;

export type CategoryName = typeof CATEGORIES[number]['name'];

export type Category = typeof CATEGORIES[number];

export const getCategoriesByType = (type: TransactionType): Category[] => {
  return CATEGORIES.filter(cat => cat.type === type);
};
