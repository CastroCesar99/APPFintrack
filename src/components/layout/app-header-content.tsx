
"use client";
import React from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AppLogoIcon } from "@/components/icons";
import { useLanguage } from "@/context/language-context";
import { useAuth } from "@/context/auth-context";
import { useDateNavigation } from "@/context/date-navigation-context";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function AppHeaderContent() {
  const { translate } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const {
    displayedMonthYearLabel,
    handlePreviousMonth,
    handleNextMonth
  } = useDateNavigation();

  const welcomeMessage = translate({ en: "Welcome,", pt: "Bem Vindo," });
  let headerDisplayTitle = translate({ en: "FinTrack", pt: "FinTrack" });

  if (!authLoading && user && user.displayName) {
    headerDisplayTitle = `${welcomeMessage} ${user.displayName}`;
  } else if (!authLoading && user && !user.displayName) {
     headerDisplayTitle = `${welcomeMessage}`; // Or keep FinTrack if no name?
  }


  return (
    <div className="flex h-14 items-center justify-between gap-4 border-b bg-background px-4 lg:px-6">
      <div className="flex items-center gap-2 flex-shrink-0">
        <SidebarTrigger className="md:hidden" />
        <AppLogoIcon />
        <h1 className="text-lg font-semibold truncate" title={headerDisplayTitle}>{headerDisplayTitle}</h1>
      </div>
      
      <div className="flex items-center gap-1 ml-auto">
        <Button
          onClick={handlePreviousMonth}
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          aria-label={translate({en: "Previous Month", pt: "Mês Anterior"})}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium text-foreground w-28 text-center truncate" title={displayedMonthYearLabel}>
          {displayedMonthYearLabel}
        </span>
        <Button
          onClick={handleNextMonth}
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          aria-label={translate({en: "Next Month", pt: "Próximo Mês"})}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
