
"use client";
import React from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { SettingsIcon, AppLogoIcon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/context/language-context"; // Import useLanguage
import { useAuth } from "@/context/auth-context"; // Import useAuth

export function AppHeaderContent() {
  const { language, setLanguage, translate } = useLanguage(); // Use language context
  const { user, loading: authLoading } = useAuth(); // Use auth context

  const appTitle = translate({
    en: "FinTrack",
    pt: "FinTrack PT",
  });

  const languageLabel = translate({
    en: "Language",
    pt: "Idioma",
  });

  const settingsSrLabel = translate({
    en: "Settings",
    pt: "Configurações",
  });

  let headerDisplayTitle = appTitle; // Default to translated app title

  if (!authLoading && user && user.displayName) {
    headerDisplayTitle = user.displayName;
  }

  return (
    <div className="flex h-14 items-center justify-between gap-4 border-b bg-background px-4 lg:px-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="md:hidden" />
        <AppLogoIcon />
        <h1 className="text-lg font-semibold">{headerDisplayTitle}</h1>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full">
            <SettingsIcon className="h-5 w-5" />
            <span className="sr-only">{settingsSrLabel}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{languageLabel}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={language} onValueChange={(val) => setLanguage(val as 'en' | 'pt')}>
            <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="pt">Português</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
