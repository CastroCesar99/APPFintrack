"use client";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { SettingsIcon, AppLogoIcon } from "@/components/icons"; // Assuming AppLogoIcon is defined in icons.tsx

export function AppHeaderContent() {
  return (
    <div className="flex h-14 items-center justify-between gap-4 border-b bg-background px-4 lg:px-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="md:hidden" />
        <AppLogoIcon className="h-6 w-6 text-primary" />
        <h1 className="text-lg font-semibold">FinTrack</h1>
      </div>
      <Button variant="ghost" size="icon" className="rounded-full">
        <SettingsIcon className="h-5 w-5" />
        <span className="sr-only">Settings</span>
      </Button>
    </div>
  );
}
