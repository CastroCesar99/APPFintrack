"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useState } from "react"; 
import {
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { AppLogoIcon, DashboardIcon, SettingsIcon } from "@/components/icons";
import { useLanguage } from "@/context/language-context";
import { useAuth } from "@/context/auth-context";
import { LogOut, CreditCard, TrendingUp, ListChecks, FileText } from "lucide-react";
import { Separator } from "@/components/ui/separator"; 

export function AppSidebarContent() {
  const pathname = usePathname();
  const { translate } = useLanguage(); 
  const { user, logOut, loading: authLoading } = useAuth();

  const appTitle = "Athena";

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
              <SidebarMenuButton
                asChild
                isActive={item.exact ? pathname === item.href : pathname.startsWith(item.href)}
                className="w-full justify-start"
                tooltip={{ children: item.label, side: "right", align: "center" }}
              >
                <Link href={item.href}>
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}

          <Separator className="my-2" />

          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith("/settings")}
              className="w-full justify-start"
              tooltip={{ children: settingsLabel, side: "right", align: "center" }}
            >
              <Link href="/settings">
                <SettingsIcon className="h-5 w-5" />
                <span>{settingsLabel}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          
          {user && !authLoading && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={logOut}
                className="w-full justify-start gap-2 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                tooltip={{ children: logoutLabel, side: "right", align: "center" }}
              >
                <LogOut className="h-5 w-5" />
                <span>{logoutLabel}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarContent>
    </>
  );
}
