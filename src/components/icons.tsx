
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
  Archive, Bell, Box, Camera, Cog, Coins, Flag, Folder, Key, Mail, MapPin, Package, Pen, Phone, Receipt, Shield, Tag, Trash, User, Wrench,
  Languages
} from 'lucide-react';
import type { CategoryName, PaymentMethodName } from '@/types';
import { CATEGORIES, PAYMENT_METHODS } from '@/types';
import { useTheme } from '@/context/theme-context';

export const iconNameToComponentMap: Record<string, LucideIcon> = {
  Briefcase, ShoppingCart, Home, Zap, Replace, Utensils, Car, HeartPulse,
  Film, ShoppingBag, Plane, BookOpen, Gift, TrendingUp, Laptop, DollarSign, CircleHelp, PiggyBank, Settings, LayoutDashboard, FileText,
  ListChecks, PlusCircle, SlidersHorizontal, Wallet, CreditCard, Sparkles,
  Archive, Bell, Box, Camera, Cog, Coins, Flag, Folder, Key, Mail, MapPin, Package, Pen, Phone, Receipt, Shield, Tag, Trash, User, Wrench,
  Languages
};

interface DynamicIconProps extends LucideProps {
  iconName: string;
}

export const DynamicIcon: React.FC<DynamicIconProps> = ({ iconName, ...props }) => {
  const IconComponent = iconNameToComponentMap[iconName] || CircleHelp;
  return <IconComponent {...props} />;
};

interface CategoryIconProps extends LucideProps {
  categoryName?: CategoryName | string; // Allow string for custom category names
  iconName?: string;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({ categoryName, iconName, ...props }) => {
  let determinedIconName = iconName;

  if (!determinedIconName && categoryName) {
    const category = CATEGORIES.find(cat => cat.name === categoryName);
    if (category) {
      determinedIconName = category.icon;
    } else {
      // Attempt to find in user-defined categories if a mechanism is provided,
      // for now, custom categories store iconName directly
      // If categoryName is an iconName string itself (from custom category data)
      if (iconNameToComponentMap[categoryName as string]) {
        determinedIconName = categoryName as string;
      }
    }
  }
  
  const IconComponent = iconNameToComponentMap[determinedIconName || ''] || CircleHelp;
  return <IconComponent {...props} />;
};

interface PaymentMethodIconProps extends LucideProps {
 iconName: string;
}

export const PaymentMethodIcon: React.FC<PaymentMethodIconProps> = ({ iconName, ...props }) => {
  const IconComponent = iconNameToComponentMap[iconName] || CircleHelp;
  return <IconComponent {...props} />;
};

export const AppLogoIcon = () => {
  const { theme } = useTheme();
  const logoSrc = theme === 'dark' ? '/white fintrack logo.ico' : '/fintrack-logo.png';
  const altText = theme === 'dark' ? 'FinTrack Logo (Dark Mode)' : 'FinTrack Logo (Light Mode)';

  return (
    <Image
      src={logoSrc}
      alt={altText}
      width={32}
      height={32}
      className="h-8 w-8"
    />
  );
};

export const SettingsIcon = Settings;
export const DashboardIcon = LayoutDashboard;
export const ExportIcon = FileText;

export { ListChecks, PlusCircle, SlidersHorizontal };

interface SelectableIconOption {
  value: string;
  label: { en: string; pt: string };
  iconComponent: LucideIcon;
}

// Helper function to get a list of selectable icons for dropdowns
export const getSelectableIcons = (): SelectableIconOption[] => {
  const iconTranslations: Record<string, { en: string; pt: string }> = {
    Briefcase: { en: "Briefcase", pt: "Pasta" },
    ShoppingCart: { en: "Shopping Cart", pt: "Carrinho de Compras" },
    Home: { en: "Home", pt: "Casa" },
    Zap: { en: "Zap (Electricity)", pt: "Raio (Eletricidade)" },
    Replace: { en: "Replace (Subscriptions)", pt: "Substituir (Assinaturas)" },
    Utensils: { en: "Utensils (Dining Out)", pt: "Talheres (Alimentação Fora)" },
    Car: { en: "Car", pt: "Carro" },
    HeartPulse: { en: "Heart Pulse (Healthcare)", pt: "Pulso Cardíaco (Saúde)" },
    Film: { en: "Film (Entertainment)", pt: "Filme (Lazer)" },
    ShoppingBag: { en: "Shopping Bag", pt: "Sacola de Compras" },
    Plane: { en: "Plane (Travel)", pt: "Avião (Viagem)" },
    BookOpen: { en: "Book Open (Education)", pt: "Livro Aberto (Educação)" },
    Gift: { en: "Gift", pt: "Presente" },
    TrendingUp: { en: "Trending Up (Investment/Income)", pt: "Tendência de Alta (Investimento/Receita)" },
    Laptop: { en: "Laptop (Freelance)", pt: "Laptop (Freelance)" },
    DollarSign: { en: "Dollar Sign (Income/Money)", pt: "Cifrão (Receita/Dinheiro)" },
    CircleHelp: { en: "Circle Help (Other/Default)", pt: "Círculo de Ajuda (Outro/Padrão)" },
    PiggyBank: { en: "Piggy Bank", pt: "Cofrinho" },
    Settings: { en: "Settings", pt: "Configurações" },
    LayoutDashboard: { en: "Dashboard", pt: "Painel" },
    FileText: { en: "File Text (Reports)", pt: "Texto de Arquivo (Relatórios)" },
    ListChecks: { en: "List Checks (Budgets)", pt: "Lista de Verificação (Orçamentos)" },
    PlusCircle: { en: "Plus Circle (Add)", pt: "Círculo de Adição (Adicionar)" },
    SlidersHorizontal: { en: "Sliders Horizontal (Manage)", pt: "Controles Deslizantes Horizontais (Gerenciar)" },
    Wallet: { en: "Wallet (Cash)", pt: "Carteira (Dinheiro)" },
    CreditCard: { en: "Credit Card", pt: "Cartão de Crédito" },
    Sparkles: { en: "Sparkles (Personal Care)", pt: "Brilhos (Cuidados Pessoais)" },
    Archive: { en: "Archive", pt: "Arquivo" },
    Bell: { en: "Bell", pt: "Sino" },
    Box: { en: "Box", pt: "Caixa" },
    Camera: { en: "Camera", pt: "Câmera" },
    Cog: { en: "Cog (Settings)", pt: "Engrenagem (Configurações)" },
    Coins: { en: "Coins", pt: "Moedas" },
    Flag: { en: "Flag", pt: "Bandeira" },
    Folder: { en: "Folder", pt: "Pasta de Arquivos" },
    Key: { en: "Key", pt: "Chave" },
    Mail: { en: "Mail (Support)", pt: "Correio (Suporte)" },
    MapPin: { en: "Map Pin", pt: "Pino de Mapa" },
    Package: { en: "Package", pt: "Pacote" },
    Pen: { en: "Pen (Edit)", pt: "Caneta (Editar)" },
    Phone: { en: "Phone", pt: "Telefone" },
    Receipt: { en: "Receipt", pt: "Recibo" },
    Shield: { en: "Shield", pt: "Escudo" },
    Tag: { en: "Tag", pt: "Etiqueta" },
    Trash: { en: "Trash (Delete)", pt: "Lixeira (Excluir)" },
    User: { en: "User", pt: "Usuário" },
    Wrench: { en: "Wrench", pt: "Chave Inglesa" },
    Languages: { en: "Languages", pt: "Idiomas" },
    // Add more translations as needed
  };

  return Object.entries(iconNameToComponentMap).map(([name, Component]) => ({
    value: name,
    label: iconTranslations[name] || { en: name.replace(/([A-Z](?=[a-z]))|([A-Z]+(?=[A-Z][a-z]|$))/g, ' $1$2').trimStart(), pt: name.replace(/([A-Z](?=[a-z]))|([A-Z]+(?=[A-Z][a-z]|$))/g, ' $1$2').trimStart() },
    iconComponent: Component as LucideIcon,
  })).sort((a,b) => a.label.en.localeCompare(b.label.en)); // Sort by English label for consistency
};
