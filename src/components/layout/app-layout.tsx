"use client";
import type React from 'react';
import { Sidebar, SidebarInset, SidebarRail } from "@/components/ui/sidebar";
import { AppSidebarContent } from "./app-sidebar-content";
import { AppHeaderContent } from "./app-header-content";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen w-full">
      <Sidebar variant="sidebar" collapsible="icon">
        <AppSidebarContent />
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="flex flex-col">
        <AppHeaderContent />
        <main className="flex-1 overflow-y-auto p-4 pt-6 md:p-6">
          {children}
        </main>
      </SidebarInset>
    </div>
  );
}
