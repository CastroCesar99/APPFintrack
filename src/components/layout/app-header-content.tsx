
"use client";
import React from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AppLogoIcon } from "@/components/icons";
import { useLanguage } from "@/context/language-context";
import { useAuth } from "@/context/auth-context";

export function AppHeaderContent() {
  const { translate } = useLanguage();
  const { user, loading: authLoading } = useAuth();

  const appTitle = translate({
    en: "FinTrack",
    pt: "FinTrack",
  });

  const welcomeMessage = translate({ en: "Welcome,", pt: "Bem Vindo," });
  let headerDisplayTitle = appTitle;

  if (!authLoading && user && user.displayName) {
    headerDisplayTitle = `${welcomeMessage} ${user.displayName}`;
  } else if (!authLoading && user && !user.displayName) {
    headerDisplayTitle = `${welcomeMessage}`;
  }

  return (
    <div className="flex h-14 items-center justify-between gap-4 border-b bg-background px-4 lg:px-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="md:hidden" />
        <AppLogoIcon />
        <h1 className="text-lg font-semibold">{headerDisplayTitle}</h1>
      </div>
      {/* Settings cog and language dropdown removed from here */}
    </div>
  );
}
