
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
  Languages, PawPrint, Dumbbell, Pizza, Shirt, Bus, GraduationCap, Ticket, Palette, Clapperboard, Gamepad2, Headphones, Music2, Tv, Train, TramFront, Sailboat, UtensilsCrossed
} from 'lucide-react';
import type { CategoryName, PaymentMethodName } from '@/types';
import { CATEGORIES, PAYMENT_METHODS } from '@/types';
import { useTheme } from '@/context/theme-context';

export const iconNameToComponentMap: Record<string, LucideIcon> = {
  Briefcase, ShoppingCart, Home, Zap, Replace, Utensils, Car, HeartPulse,
  Film, ShoppingBag, Plane, BookOpen, Gift, TrendingUp, Laptop, DollarSign, CircleHelp, PiggyBank, Settings, LayoutDashboard, FileText,
  ListChecks, PlusCircle, SlidersHorizontal, Wallet, CreditCard, Sparkles,
  Archive, Bell, Box, Camera, Cog, Coins, Flag, Folder, Key, Mail, MapPin, Package, Pen, Phone, Receipt, Shield, Tag, Trash, User, Wrench,
  Languages, PawPrint, Dumbbell, Pizza, Shirt, Bus, GraduationCap, Ticket, Palette, Clapperboard, Gamepad2, Headphones, Music2, Tv, Train, TramFront, Sailboat, UtensilsCrossed
};

interface DynamicIconProps extends LucideProps {
  iconName: string;
}

export const DynamicIcon: React.FC<DynamicIconProps> = ({ iconName, ...props }) => {
  const IconComponent = iconNameToComponentMap[iconName] || CircleHelp;
  return <IconComponent {...props} />;
};

interface CategoryIconProps extends LucideProps {
  categoryName?: CategoryName | string;
  iconName?: string;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({ categoryName, iconName, ...props }) => {
  let determinedIconName = iconName;

  if (!determinedIconName && categoryName) {
    const category = CATEGORIES.find(cat => cat.name === categoryName);
    if (category) {
      determinedIconName = category.icon;
    } else {
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
  value: string; // This is the icon key, e.g., "ShoppingCart"
  label: { en: string; pt: string }; // This is the translatable display name
  iconComponent: LucideIcon;
}

// Helper function to get a list of selectable icons for dropdowns
export const getSelectableIcons = (): SelectableIconOption[] => {
  const iconTranslations: Record<string, { en: string; pt: string }> = {
    Briefcase: { en: "Briefcase", pt: "Pasta de Trabalho" },
    ShoppingCart: { en: "Shopping Cart", pt: "Carrinho de Compras" },
    Home: { en: "Home", pt: "Casa" },
    Zap: { en: "Electricity", pt: "Eletricidade" }, // Changed from Zap
    Replace: { en: "Subscriptions", pt: "Assinaturas" }, // Changed from Replace
    Utensils: { en: "Dining Out", pt: "Restaurantes" }, // Changed from Utensils
    Car: { en: "Car", pt: "Carro" },
    HeartPulse: { en: "Healthcare", pt: "Saúde" }, // Changed from Heart Pulse
    Film: { en: "Entertainment (Movies)", pt: "Lazer (Filmes)" }, // Specified
    ShoppingBag: { en: "Shopping (General)", pt: "Compras (Geral)" },
    Plane: { en: "Travel (Flights)", pt: "Viagens (Voos)" }, // Specified
    BookOpen: { en: "Education", pt: "Educação" },
    Gift: { en: "Gifts/Donations", pt: "Presentes/Doações" },
    TrendingUp: { en: "Investments/Income", pt: "Investimentos/Receita" },
    Laptop: { en: "Work/Freelance", pt: "Trabalho/Freelance" }, // Changed from Laptop
    DollarSign: { en: "Money/Salary", pt: "Dinheiro/Salário" },
    CircleHelp: { en: "Other/Default", pt: "Outro/Padrão" },
    PiggyBank: { en: "Savings", pt: "Economias" }, // Changed from Piggy Bank
    Settings: { en: "Settings", pt: "Configurações" },
    LayoutDashboard: { en: "Dashboard", pt: "Painel" },
    FileText: { en: "Reports/Documents", pt: "Relatórios/Documentos" },
    ListChecks: { en: "Budgets/Tasks", pt: "Orçamentos/Tarefas" },
    PlusCircle: { en: "Add", pt: "Adicionar" },
    SlidersHorizontal: { en: "Manage/Adjust", pt: "Gerenciar/Ajustar" },
    Wallet: { en: "Wallet (Cash)", pt: "Carteira (Dinheiro)" },
    CreditCard: { en: "Card (Credit/Debit)", pt: "Cartão (Crédito/Débito)" }, // General card
    Sparkles: { en: "Personal Care", pt: "Cuidados Pessoais" },
    Archive: { en: "Archive", pt: "Arquivo" },
    Bell: { en: "Notifications", pt: "Notificações" }, // Changed from Bell
    Box: { en: "Box/Storage", pt: "Caixa/Armazenamento" },
    Camera: { en: "Photography", pt: "Fotografia" }, // Changed from Camera
    Cog: { en: "System Settings", pt: "Configurações do Sistema" }, // Changed from Cog
    Coins: { en: "Coins/Change", pt: "Moedas/Troco" },
    Flag: { en: "Goals/Milestones", pt: "Metas/Marcos" }, // Changed from Flag
    Folder: { en: "Files/Organization", pt: "Arquivos/Organização" },
    Key: { en: "Security/Access", pt: "Segurança/Acesso" },
    Mail: { en: "Mail/Support", pt: "Correio/Suporte" },
    MapPin: { en: "Location", pt: "Localização" },
    Package: { en: "Packages/Deliveries", pt: "Pacotes/Entregas" },
    Pen: { en: "Edit", pt: "Editar" },
    Phone: { en: "Phone/Communication", pt: "Telefone/Comunicação" },
    Receipt: { en: "Receipts/Bills", pt: "Recibos/Contas" },
    Shield: { en: "Security/Insurance", pt: "Segurança/Seguro" },
    Tag: { en: "Label/Tag", pt: "Etiqueta/Tag" },
    Trash: { en: "Delete", pt: "Excluir" },
    User: { en: "Profile/User", pt: "Perfil/Usuário" },
    Wrench: { en: "Maintenance/Tools", pt: "Manutenção/Ferramentas" },
    Languages: { en: "Language", pt: "Idioma" },
    PawPrint: { en: "Pets", pt: "Animais de Estimação" },
    Dumbbell: { en: "Fitness/Gym", pt: "Fitness/Academia" },
    Pizza: { en: "Pizza/Fast Food", pt: "Pizza/Fast Food" },
    Shirt: { en: "Clothing", pt: "Vestuário" },
    Bus: { en: "Public Transport", pt: "Transporte Público" },
    GraduationCap: { en: "Studies/University", pt: "Estudos/Universidade" },
    Ticket: { en: "Events/Tickets", pt: "Eventos/Ingressos" },
    Palette: { en: "Hobbies/Art", pt: "Hobbies/Arte" },
    Clapperboard: { en: "Movies/Cinema", pt: "Filmes/Cinema" },
    Gamepad2: { en: "Gaming", pt: "Jogos" },
    Headphones: { en: "Music/Audio", pt: "Música/Áudio" },
    Music2: { en: "Concerts/Music", pt: "Shows/Música" },
    Tv: { en: "TV/Streaming", pt: "TV/Streaming" },
    Train: { en: "Train Travel", pt: "Viagem de Trem" },
    TramFront: { en: "Tram/Metro", pt: "Bonde/Metrô" },
    Sailboat: { en: "Boating/Sailing", pt: "Passeio de Barco/Vela" },
    UtensilsCrossed: { en: "Restaurant", pt: "Restaurante" },
  };

  return Object.entries(iconNameToComponentMap)
    .map(([name, Component]) => ({
      value: name,
      label: iconTranslations[name] || { en: name.replace(/([A-Z](?=[a-z]))|([A-Z]+(?=[A-Z][a-z]|$))/g, ' $1$2').trimStart(), pt: name.replace(/([A-Z](?=[a-z]))|([A-Z]+(?=[A-Z][a-z]|$))/g, ' $1$2').trimStart() },
      iconComponent: Component as LucideIcon,
    }))
    .sort((a, b) => a.label.en.localeCompare(b.label.en)); // Sort by English label for consistent order
};
