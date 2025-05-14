"use client";
import type { LucideProps, LucideIcon } from 'lucide-react';
import {
  Briefcase, ShoppingCart, Home, Zap, Replace, Utensils, Car, HeartPulse,
  Film, ShoppingBag, Plane, BookOpen, Gift, TrendingUp, Laptop, DollarSign, CircleHelp, PiggyBank, Settings, LayoutDashboard, FileText
} from 'lucide-react';
import type { CategoryName } from '@/types';
import { CATEGORIES } from '@/types';

// Centralized icon map based on CATEGORIES constant
export const categoryIconsMap: Record<CategoryName, LucideIcon> = CATEGORIES.reduce((acc, category) => {
  const iconMapping: Record<string, LucideIcon> = {
    Briefcase, ShoppingCart, Home, Zap, Replace, Utensils, Car, HeartPulse,
    Film, ShoppingBag, Plane, BookOpen, Gift, TrendingUp, Laptop, DollarSign, CircleHelp
  };
  acc[category.name] = iconMapping[category.icon] || CircleHelp;
  return acc;
}, {} as Record<CategoryName, LucideIcon>);

interface CategoryIconProps extends LucideProps {
  categoryName: CategoryName | string; // Allow string for flexibility, but ideally CategoryName
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({ categoryName, ...props }) => {
  const IconComponent = categoryIconsMap[categoryName as CategoryName] || CircleHelp;
  return <IconComponent {...props} />;
};

// Export commonly used app icons
export const AppLogoIcon = PiggyBank;
export const SettingsIcon = Settings;
export const DashboardIcon = LayoutDashboard;
export const ExportIcon = FileText;
