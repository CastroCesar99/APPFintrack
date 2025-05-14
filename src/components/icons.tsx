
"use client";
import type { LucideProps, LucideIcon } from 'lucide-react';
import {
  Briefcase, ShoppingCart, Home, Zap, Replace, Utensils, Car, HeartPulse,
  Film, ShoppingBag, Plane, BookOpen, Gift, TrendingUp, Laptop, DollarSign, CircleHelp, PiggyBank, Settings, LayoutDashboard, FileText,
  ListChecks, 
  PlusCircle, 
  SlidersHorizontal,
  Wallet, // For Dinheiro
  CreditCard, // For Cartão de Débito/Crédito
  Sparkles // For Personal Care / Cuidados Pessoais
} from 'lucide-react';
import type { CategoryName, PaymentMethodName } from '@/types';
import { CATEGORIES, PAYMENT_METHODS } from '@/types';

// Centralized icon map based on CATEGORIES constant
export const categoryIconsMap: Record<CategoryName, LucideIcon> = CATEGORIES.reduce((acc, category) => {
  const iconMapping: Record<string, LucideIcon> = {
    Briefcase, ShoppingCart, Home, Zap, Replace, Utensils, Car, HeartPulse,
    Film, ShoppingBag, Plane, BookOpen, Gift, TrendingUp, Laptop, DollarSign, CircleHelp, Sparkles
  };
  acc[category.name] = iconMapping[category.icon] || CircleHelp;
  return acc;
}, {} as Record<CategoryName, LucideIcon>);


interface CategoryIconProps extends LucideProps {
  categoryName: CategoryName | string;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({ categoryName, ...props }) => {
  const IconComponent = categoryIconsMap[categoryName as CategoryName] || CircleHelp;
  return <IconComponent {...props} />;
};

// Icon map for Payment Methods
export const paymentMethodIconsMap: Record<PaymentMethodName, LucideIcon> = PAYMENT_METHODS.reduce((acc, method) => {
  const iconMapping: Record<string, LucideIcon> = {
    Wallet, CreditCard
  };
  acc[method.name] = iconMapping[method.icon] || CircleHelp;
  return acc;
}, {} as Record<PaymentMethodName, LucideIcon>);

interface PaymentMethodIconProps extends LucideProps {
  methodName: PaymentMethodName | string;
}

export const PaymentMethodIcon: React.FC<PaymentMethodIconProps> = ({ methodName, ...props }) => {
  const IconComponent = paymentMethodIconsMap[methodName as PaymentMethodName] || CircleHelp;
  return <IconComponent {...props} />;
};


// Export commonly used app icons
export const AppLogoIcon = () => <img src="/image/fintrack logo.png" alt="FinTrack Logo" className="h-8 w-8" />;
export const SettingsIcon = Settings;
export const DashboardIcon = LayoutDashboard;
export const ExportIcon = FileText;

// Export new icons for direct use if needed
export { ListChecks, PlusCircle, SlidersHorizontal };
