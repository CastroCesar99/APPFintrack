
"use client";
import type { LucideProps, LucideIcon } from 'lucide-react';
import Image from 'next/image';
import {
  Briefcase, ShoppingCart, Home, Zap, Replace, Utensils, Car, HeartPulse,
  Film, ShoppingBag, Plane, BookOpen, Gift, TrendingUp, Laptop, DollarSign, CircleHelp, PiggyBank, Settings, LayoutDashboard, FileText,
  ListChecks,
  PlusCircle,
  SlidersHorizontal,
  Wallet,
  CreditCard,
  Sparkles,
  Archive, Bell, Box, Camera, Cog, Coins, Flag, Folder, Key, Mail, MapPin, Package, Pen, Phone, Receipt, Shield, Tag, Trash, User, Wrench
} from 'lucide-react';
import type { CategoryName, PaymentMethodName } from '@/types';
import { CATEGORIES, PAYMENT_METHODS } from '@/types'; // Import CATEGORIES

// Centralized map of icon string names to Lucide components
export const iconNameToComponentMap: Record<string, LucideIcon> = {
  Briefcase, ShoppingCart, Home, Zap, Replace, Utensils, Car, HeartPulse,
  Film, ShoppingBag, Plane, BookOpen, Gift, TrendingUp, Laptop, DollarSign, CircleHelp, PiggyBank, Settings, LayoutDashboard, FileText,
  ListChecks, PlusCircle, SlidersHorizontal, Wallet, CreditCard, Sparkles,
  Archive, Bell, Box, Camera, Cog, Coins, Flag, Folder, Key, Mail, MapPin, Package, Pen, Phone, Receipt, Shield, Tag, Trash, User, Wrench
};


interface DynamicIconProps extends LucideProps {
  iconName: string;
}

export const DynamicIcon: React.FC<DynamicIconProps> = ({ iconName, ...props }) => {
  const IconComponent = iconNameToComponentMap[iconName] || CircleHelp;
  return <IconComponent {...props} />;
};

interface CategoryIconProps extends LucideProps {
  categoryName?: CategoryName; // Optional: the English name of the category
  iconName?: string;         // Optional: direct icon name string
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({ categoryName, iconName, ...props }) => {
  let determinedIconName = iconName;

  if (!determinedIconName && categoryName) {
    const category = CATEGORIES.find(cat => cat.name === categoryName);
    if (category) {
      determinedIconName = category.icon;
    }
  }

  const IconComponent = iconNameToComponentMap[determinedIconName || ''] || CircleHelp;
  return <IconComponent {...props} />;
};


interface PaymentMethodIconProps extends LucideProps {
 iconName: string; // Now directly takes the icon name string
}

export const PaymentMethodIcon: React.FC<PaymentMethodIconProps> = ({ iconName, ...props }) => {
  const IconComponent = iconNameToComponentMap[iconName] || CircleHelp;
  return <IconComponent {...props} />;
};

// Export commonly used app icons
export const AppLogoIcon = () => <Image src="/fintrack-logo.png" alt="FinTrack Logo" width={32} height={32} />;
export const SettingsIcon = Settings;
export const DashboardIcon = LayoutDashboard;
export const ExportIcon = FileText;

// Export new icons for direct use if needed (already exported by name from lucide-react)
export { ListChecks, PlusCircle, SlidersHorizontal };

// Helper function to get a list of selectable icons for dropdowns
export const getSelectableIcons = () => {
  return Object.entries(iconNameToComponentMap).map(([name, Component]) => ({
    value: name,
    label: name.replace(/([A-Z](?=[a-z]))|([A-Z]+(?=[A-Z][a-z]|$))/g, ' $1$2').trimStart(), // Add spaces for readability
    iconComponent: Component as LucideIcon,
  })).sort((a,b) => a.label.localeCompare(b.label)); // Sort alphabetically by label
}
