
"use client";
import React from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
// AppLogoIcon import removed as it's no longer used in the header
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
  
  let userGreeting: string | null = null;
  if (!authLoading && user && user.displayName) {
    userGreeting = `${welcomeMessage} ${user.displayName}`;
  } else if (!authLoading && user && !user.displayName) {
    userGreeting = `${welcomeMessage}`; 
  }


  return (
    <div className="flex h-14 items-center justify-between gap-4 border-b bg-background px-4 lg:px-6">
      {/* Left Section: Sidebar Trigger and User Greeting */}
      <div className="flex items-center gap-3">
        <SidebarTrigger className="md:hidden" /> {/* Remains for mobile sidebar toggle */}
        {userGreeting && (
          <span className="text-base font-semibold text-foreground truncate" title={userGreeting}>
            {userGreeting}
          </span>
        )}
        {!userGreeting && !authLoading && ( // Fallback if user is not loaded or has no name
           <span className="text-base font-semibold text-foreground">
            {translate({ en: "FinTrack", pt: "FinTrack"})}
          </span>
        )}
      </div>
      
      {/* Right Section: Month Navigation */}
      <div className="flex items-center gap-1">
        <Button
          onClick={handlePreviousMonth}
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          aria-label={translate({en: "Previous Month", pt: "Mês Anterior"})}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-base font-medium text-foreground w-32 text-center truncate" title={displayedMonthYearLabel}>
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
