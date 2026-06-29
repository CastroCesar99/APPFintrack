
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useState } from "react"; // Added useState for dialog
import {
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  // SidebarFooter, // Removed SidebarFooter import
} from "@/components/ui/sidebar";
// Button import might not be needed if SidebarMenuButton handles onClick for logout
import { AppLogoIcon, DashboardIcon, SettingsIcon } from "@/components/icons";
import { useLanguage } from "@/context/language-context";
import { useAuth } from "@/context/auth-context";
import { LogOut, CreditCard, TrendingUp, ListChecks, FileText } from "lucide-react";
// Dialog related imports are removed as settings button now navigates
import { Separator } from "@/components/ui/separator"; 

export function AppSidebarContent() {
  const pathname = usePathname();
  const { translate } = useLanguage(); // Removed setLanguage as it's not used here
  const { user, logOut, loading: authLoading } = useAuth();
  // Removed isSettingsDialogOpen and setIsSettingsDialogOpen

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
      <SidebarContent className="p-2"> {/* SidebarContent handles scrolling */}
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href}>
                {/* @next-codemod-error This Link previously used the now removed `legacyBehavior` prop, and has a child that might not be an anchor. The codemod bailed out of lifting the child props to the Link. Check that the child component does not render an anchor, and potentially move the props manually to Link. */
                }
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

          {/* Moved Settings and Logout into the main menu, after a separator */}
          <Separator className="my-2" />

          <SidebarMenuItem>
            <Link href="/settings">
              {/* @next-codemod-error This Link previously used the now removed `legacyBehavior` prop, and has a child that might not be an anchor. The codemod bailed out of lifting the child props to the Link. Check that the child component does not render an anchor, and potentially move the props manually to Link. */
              }
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
          </SidebarMenuItem>
          
          {user && !authLoading && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={logOut} // SidebarMenuButton can handle onClick
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
      {/* SidebarFooter is removed as its content is now part of SidebarMenu */}
    </>
  );
}
