
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import {
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { AppLogoIcon, DashboardIcon, SettingsIcon } from "@/components/icons";
import { useLanguage } from "@/context/language-context";
import { useAuth } from "@/context/auth-context";
import { LogOut, CreditCard, TrendingUp, ListChecks, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";


export function AppSidebarContent() {
  const pathname = usePathname();
  const { language, setLanguage, translate } = useLanguage();
  const { user, logOut, loading: authLoading } = useAuth();

  const appTitle = "FinTrack";

  const menuItems = [
    {
      href: "/",
      label: translate({ en: "Dashboard", pt: "Painel" }),
      icon: DashboardIcon,
      exact: true
    },
    {
      href: "/expenses",
      label: translate({ en: "Expenses", pt: "Despesas" }),
      icon: CreditCard,
      exact: false
    },
    {
      href: "/income",
      label: translate({ en: "Income", pt: "Receitas" }),
      icon: TrendingUp,
      exact: false
    },
    {
      href: "/budgets",
      label: translate({ en: "Budgets", pt: "Orçamentos" }),
      icon: ListChecks,
      exact: false
    },
    {
      href: "/reports",
      label: translate({ en: "Reports", pt: "Relatórios" }),
      icon: FileText,
      exact: false
    },
  ];

  const settingsLabel = translate({
    en: "Settings",
    pt: "Configurações",
  });

  const logoutLabel = translate({
    en: "Logout",
    pt: "Sair",
  });

  return (
    <>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-2">
          <AppLogoIcon />
          <span className="text-xl font-semibold">{appTitle}</span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="p-2">
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href} passHref legacyBehavior>
                <SidebarMenuButton
                  asChild
                  isActive={item.exact ? pathname === item.href : pathname.startsWith(item.href)}
                  className="w-full justify-start"
                  tooltip={{ children: item.label, side: "right", align: "center" }}
                >
                  <a>
                    <item.icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </a>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-2 border-t space-y-1"> {/* MODIFIED HERE */}
        <Link href="/settings" passHref legacyBehavior>
          <SidebarMenuButton
            asChild
            isActive={pathname.startsWith("/settings")}
            className="w-full justify-start"
            tooltip={{ children: settingsLabel, side: "right", align: "center" }}
          >
            <a>
              <SettingsIcon className="h-5 w-5" />
              <span>{settingsLabel}</span>
            </a>
          </SidebarMenuButton>
        </Link>
        
        {user && !authLoading && (
          <Button variant="ghost" onClick={logOut} className="w-full justify-start gap-2 text-red-500 hover:text-red-600 hover:bg-red-500/10">
            <LogOut className="h-5 w-5" />
            <span>{logoutLabel}</span>
          </Button>
        )}
      </SidebarFooter>
    </>
  );
}
